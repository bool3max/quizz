# a module implementing various helper database functions for use within Flask REST endpoints

import sqlite3, os

DB_PATH = os.environ['DB_PATH']

def get_quizzes():
    with sqlite3.connect(DB_PATH) as conn:
        cur = conn.cursor() 
        cur.execute("""
            SELECT quizzes.quiz_id,
                   quiz_name,
                   quiz_description,
                   quiz_colorcode,
                   COUNT(quiz_questions.question_id)
            FROM quizzes
            INNER JOIN quiz_questions ON quizzes.quiz_id=quiz_questions.quiz_id
            GROUP BY quizzes.quiz_id;
        """)

        return [{
            'quiz_id':          row[0],
            'quiz_name':        row[1],
            'quiz_description': row[2],
            'quiz_colorcode':   row[3],
            'quiz_nquestions':  row[4] 
        } for row in cur.fetchall()]

def get_quiz(quiz_id):
    query_get_questions = """
        SELECT questions.question_id,
               questions.question_text
        FROM quiz_questions
        INNER JOIN questions ON quiz_questions.question_id = questions.question_id
        WHERE quiz_questions.quiz_id = ?
        ORDER BY questions.question_text ASC
    """

    query_get_choices = """
        SELECT choice_text
        FROM choices
        WHERE question_id = ?
        ORDER BY choice_text ASC
    """

    response = {
        "questions": []
    }

    with sqlite3.connect(DB_PATH) as conn:
        cur = conn.cursor()

        cur.execute("SELECT quiz_name, quiz_description, quiz_colorcode, quiz_client_should_randomize_order FROM quizzes WHERE quiz_id=?", (quiz_id, ))
        r = cur.fetchone()

        response["quiz_client_should_randomize_order"] = bool(r[3])
        response["quiz_name"] = r[0]
        response["quiz_description"] = r[1]
        response["quiz_colorcode"] = r[2]

        questions = cur.execute(query_get_questions, (quiz_id, )).fetchall()
        
        for q in questions:
            question_text = q[1]
            question_id = q[0]

            q_dict = {
                "question_text": question_text,
                "choices": [c[0] for c in cur.execute(query_get_choices, (question_id, ))],
                "num_correct_answers": cur.execute("SELECT COUNT(choice_id) FROM answers WHERE answer_to=? GROUP BY answer_to", (question_id, )).fetchone()[0]
            }

            # fetch all choices for that particular question and append them to the list

            response["questions"].append(q_dict)

    return response

def check_guesses(guesses_payload):
    answers_query = """
        SELECT qq.question_id, answers.choice_id
        FROM quiz_questions qq
        INNER JOIN questions ON qq.question_id = questions.question_id
        INNER JOIN answers ON qq.question_id = answers.answer_to
        WHERE qq.quiz_id = ?
        ORDER BY questions.question_text ASC
    """
    quiz_id = guesses_payload["quiz_id"]

    response = {
        "answers": []
    }

    with sqlite3.connect(DB_PATH) as conn:
        cur = conn.cursor()

        client_should_see_correct_answers = bool(cur.execute("SELECT quiz_client_should_see_correct_answers FROM quizzes WHERE quiz_id=?", (quiz_id, )).fetchone()[0])

        # obtain the correct answers of the questions in the quiz the client was taking
        answers = cur.execute(answers_query, (quiz_id, )).fetchall()

        # JSON response payload that will be sent to the client
        response = {
            "answers": []
        }

        response["client_can_see_correct_answers"] = client_should_see_correct_answers

        question_index = 0
        for guess_choice_index in guesses_payload["guesses"]:
            current_question_id = answers[question_index][0]
            count_answers = cur.execute("SELECT COUNT(choice_id) FROM answers WHERE answer_to=? GROUP BY answer_to", (current_question_id, )).fetchone()[0]

            # get the choice IDs for the particular question in alphabetical order
            choices = [c[0] for c in cur.execute("SELECT choice_id FROM choices WHERE question_id=? ORDER BY choice_text ASC", (current_question_id,))]

            if isinstance(guess_choice_index, list) and count_answers > 1:
                inner_answers = []
                if client_should_see_correct_answers:
                    inner_answers.append([choices.index(answers[x][1]) for x in range(question_index, question_index + count_answers)])

                for i in range(count_answers):
                    client_answered_right = False
                    for y in range(question_index, question_index + count_answers):
                        if choices[guess_choice_index[i]] == answers[y][1]:
                            client_answered_right = True
                            break

                    inner_answers.append(client_answered_right)

                response["answers"].append(inner_answers)
                    
            else:
                client_answered_right = False
                if choices[guess_choice_index] == answers[question_index][1]:
                    # client provided correct answer
                    client_answered_right = True

                if client_should_see_correct_answers:
                    response["answers"].append([client_answered_right, choices.index(answers[question_index][1])])
                else:
                    response["answers"].append(client_answered_right)

                
            question_index += count_answers

        return response
