import sqlite3, os
from flask import Flask, request, url_for, redirect, send_file
import database_helper as db

DB_PATH = os.environ['DB_PATH']

app = Flask(__name__)

# tuples consisting of an endpoint return value and an HTTP status code
_responses = {
    "invalid_request": ({"Message": "Invalid request."}, 400)
}

@app.route("/api/get_quizzes", methods=["GET"])
def api_get_quizzes():
    """
    A GET API endpoint that retrives all quizzes in a JSON format.
    The client receives the id, name, description, color, and number of questions in the quiz.
    """

    return {'quizzes': db.get_quizzes()}

@app.route("/api/new_quiz", methods=["POST"])
def api_push_new_quiz():
    """
    Create a new quiz.
    The client sends a JSON payload (the Content-Type MIME type of the payload must be "application/json")
    in the following form: 

        {
            "quiz_name": <name>,
            "quiz_description": <description>,
            "quiz_colorcode": <hex_colorcode>, -- not required
            "quiz_client_should_randomize_order": true/false,
            "questions": [
                {
                    "question_text": <text>,
                    "choices": [
                        <choice_text>,
                        <choice_text>,
                        ...
                    ],
                    "answers": [0, 2] -- indices of correct answers, multiple if there are multiple possible answers
                },
                ...
            ],
        }
    """

    if not request.is_json:
        # payload must be JSON data
        return _responses["invalid_request"]

    data = request.get_json()
    if "quiz_name" not in data or "quiz_description" not in data or "questions" not in data or "quiz_client_should_randomize_order" not in data:
        return _responses["invalid_request"]

    with sqlite3.connect(DB_PATH) as conn:
        cur = conn.cursor()
        # first, push the new quiz to the database
        query_string_push_quiz = """
            INSERT INTO quizzes (quiz_name, quiz_description, quiz_colorcode, quiz_client_should_randomize_order)
            VALUES (?, ?, ?, ?);
        """
        cur.execute(query_string_push_quiz, (data['quiz_name'], data['quiz_description'], data['quiz_colorcode'] if 'quiz_colorcode' in data else "#a33ae0", 1 if data['quiz_client_should_randomize_order'] else 0,))
        quiz_id = cur.lastrowid

        query_string_push_questions = """
            INSERT INTO questions (question_text)
            VALUES (?);
        """

        query_string_push_choices = """
            INSERT INTO choices (choice_text, question_id) VALUES (?, ?);
        """

        query_string_push_answers = """
            INSERT INTO answers (answer_to, choice_id) VALUES (?, ?);
        """

        query_string_push_quizquestions = """
            INSERT INTO quiz_questions (quiz_id, question_id) VALUES (?, ?);
        """
        # for each question in the payload, push it, and all of its associated choices and aswers, to the database
        for question in data['questions']:
            # insert the question
            cur.execute(query_string_push_questions, (question['question_text'],))
            question_id = cur.lastrowid # save the rowid of the inserted question

            # relate the current question to the current quiz
            cur.execute(query_string_push_quizquestions, (quiz_id, question_id,))

            # insert the related choices
            for choice_index, choice_text in enumerate(question['choices']):
                cur.execute(query_string_push_choices, (choice_text, question_id,))
                # check if the current choice is the correct answer to the question
                if choice_index in question['answers']:
                    # mark the current choice as the correct one to the question in the database
                    cur.execute(query_string_push_answers, (question_id, cur.lastrowid,))

    return ({"Message": "Created"}, 201)

@app.route("/api/get_quiz/<int:quiz_id>", methods = ["GET"])
def api_get_quiz(quiz_id):
    """
    Get all questions belonging to the respective quiz. The response is a JSON payload in the following form: 
    {
        "questions": [
            {
                "question_text": <question_text>,
                "choices": ["<choice_text1>", "<choice_text2>", ...],
                "num_correct_answers": 1 

            },
            {...},
            {...}
        ],
        "quiz_client_should_randomize_order": true/false
    }

    The client does not receive the IDs of the questions/choices for security reasons.

    Once the client is done taking the particular quiz, they can verify the answers using the "/api/verify_quiz/<quiz_id>" endpoint.
    """

    # check if the quiz_id exists in the database
    with sqlite3.connect(DB_PATH) as conn:
        cur = conn.cursor()

        if cur.execute("SELECT quiz_id FROM quizzes WHERE quiz_id=?", (quiz_id, )).fetchone() is None:
            return ("Quiz not found", 404)

    return db.get_quiz(quiz_id)

@app.route("/api/check_guesses", methods = ["POST"])
def api_check_guesses():
    """
    The client sends a JSON payload in the following form: 

    {
        "quiz_id": <quiz_id> -- the ID of the quiz the players is taking
        "guesses": [
            <choice_index_of_answer_to_1st_question>,
            <choice_index_of_answer_to_2nd_question>,
            [
                <choice_index_of_answer1_to_3rd_question>,
                <choice_index_of_answer2_to_3rd_question>,
                ...
            ],
            ...
        ]
    }

    Elements of the "answers" array are indices of corresponding choices of the appropriate answer.

    This works because questions (and their corresponding choices) of a particular quiz are always delivered
    in the same (alphabetically ascending) order.

    Currently there is no mechanism in place to prevent 'cheating', considering that the user could simply
    submit arbitrary values as payload to this endpoint and observe the correct results from the server's
    response. Even more trivially, they could simply start the quiz, submit random guesses, and observe the
    correct answers from the server's response.

    The response: 

    The server responds back with a JSON payload in the following form: 

    {
        "client_can_see_correct_answers": true/false,
        "answers": [true, false, [false, false, true], true, false, [false, true, true, true], false, ...]
    }

    If "client_can_see_correct_answers" is true, then the elements of the "answers" array are all arrays,
    where the first element is a boolean indicating whether the client got the answer right, and the second
    element is the integer index of the actual correct choice (i.e. answer) for that particular question

    {
        "client_can_see_correct_answers": true,
        "answers": [[false, 1], [true, 3], [false, 0], [false, 4], ...]
    }

    If a particular question has multiple answers, and the server is set to show correct answers, then
    the payload is in the following form (here the 2nd element denotes a question with multiple answers):

    {
        "client_can_see_correct_answers": true,
        "answers": [[false, 4], [[1, 0, 2, 3], false, true, true, true], [true, 3], ...]
    }

    """
    
    if not request.is_json:
        return _responses["invalid_request"]

    data = request.get_json()

    with sqlite3.connect(DB_PATH) as conn:
        cur = conn.cursor()

        # check to see if client answered all questions
        num_questions = cur.execute("SELECT COUNT(question_id) FROM quiz_questions WHERE quiz_id=? GROUP BY quiz_id", (data["quiz_id"], )).fetchone()[0]
        if len(data["guesses"]) != num_questions:
            return _responses["invalid_request"];


    return db.check_guesses(data)

@app.route("/")
def index():
    # not gonna be using Jinja2 templates, since we're doing clientside rendering
    return send_file("static/index.html")
