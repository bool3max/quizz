const api = {
    async getQuizzes() {
        const response = await fetch("/api/get_quizzes");
        const data = await response.json()
        return data.quizzes
    },

    async getQuiz(quiz_id) {
        const response = await fetch(`/api/get_quiz/${quiz_id}`)
        const data = await response.json()
        return data
    },

    async pushQuiz(payload) {
        console.log("pushQuiz payload: ", payload)
        const response = await fetch("/api/new_quiz", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(payload)
        })

        return await response.ok
    },

    async checkGuesses(payload) {
        const response = await fetch("/api/check_guesses", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(payload)
        })

        return await response.json()
    }
}

const app = {
    locationHashChanged() {
        const hash = window.location.hash

        if (hash == "") {
                $("#quiz_maker, #quiz_taker").hide();
                $("#quiz_browser").show();

                app.renderQuizBrowser()
                app.helpers.resetRootColor()
        } else if (hash == "#submit") {
                $("#quiz_browser, #quiz_taker").hide();
                $("#quiz_maker").show();
                app.helpers.resetRootColor()
        } else if (hash.startsWith("#quiz")) {
                $("#quiz_browser, #quiz_maker").hide();
                $("#quiz_taker").show();
                app.renderQuiz()
        }
    },

    async submitNewQuiz(e) {
        e.preventDefault() // prevent regular form submission

        request_payload = {questions: []}

        // traverse the DOM and construct the response payload object
        request_payload.quiz_name = $("#f_quiz_name").val()
        request_payload.quiz_description = $("#f_quiz_description").val()
        request_payload.quiz_colorcode = $("#f_quiz_colorcode").val()
        request_payload.quiz_client_should_randomize_order = $("#f_quiz_randomize_order").prop("checked")

        $(".quiz-maker-question-text-input").each((index, element) => {
            const currentQuestionObject = {choices: [], answers: []},
                  e = $(element)

            if (e.val().length < 1) return; // skip empty questions
            currentQuestionObject.question_text = e.val()

            // loop through the choices for this particular question and push them to the object
            e.parents().eq(1).find(".quiz-maker-question-choice-text-input").each((choice_index, choice_element) => {
                choice_e = $(choice_element)
                if (choice_e.val().length < 1) return;

                currentQuestionObject.choices.push(choice_e.val())

                // check if the current choice is marked as a correct answer, and if so, push its index to the array as well
                if (choice_e.next().prop("checked")) {
                    currentQuestionObject.answers.push(choice_index)
                }
            })

            request_payload.questions.push(currentQuestionObject)
        })

        const response = await api.pushQuiz(request_payload)
        if(response) {
            alert("Successfully pushed new quiz!")

            // clear and cleanup input fields
            $("#quiz-maker-basic-info input[type=text]").val("")
            $("#f_quiz_randomize_order").prop("checked", false)
            $("fieldset.quiz-maker-question").first().siblings().remove()
            $("fieldset.quiz-maker-question").first().find("input[type=text]").val("")
            $("fieldset.quiz-maker-question").first().find("input[type=checkbox]").prop("checked", false)
        } else {
            alert("Failed pushing new quiz - check console...")
        }
    },

    async renderQuizBrowser() {
        // fetch all quizzes from the database, and reload the quiz browser view with the new data

        const quizzes = await api.getQuizzes(),
              root = $("#quiz_browser_row")

        root.children().remove()
        
        quizzes.forEach(q => {
            const card = $("<div/>", {class: "col quiz-browser-card"}).css("background-color", q.quiz_colorcode)
                .append($("<div/>", {class: "quiz-browser-title", text: q.quiz_name}).data("quiz_id", q.quiz_id))
                .append($("<div/>", {class: "quiz-browser-description", text: q.quiz_description}).data("quiz_id", q.quiz_id))
                .append($("<div/>", {class: "quiz-browser-qcount", text: `${q.quiz_nquestions} questions`}).data("quiz_id", q.quiz_id))
                .data("quiz_id", q.quiz_id)

            root.append(card)
        })
    },

    async renderQuiz() {
        const quiz_id = Number(window.location.hash.split("#")[2]),
              quiz_data = await api.getQuiz(quiz_id)

        console.log(quiz_data)

        $("#quiz-taker-quiz-title").html(quiz_data.quiz_name)
        $(document.body).css("background-color", quiz_data.quiz_colorcode)

        const quiz_taker_row = $("#quiz-taker-row")
        quiz_taker_row.children().remove()

        quiz_data.questions.forEach((question, question_index) => {
            const has_multiple_answers = question.num_correct_answers > 1
            const fs = $("<fieldset/>", {class: "col quiz-taker-question"}).append($("<h5/>", {text: question.question_text})).data({question_index: question_index, n_answers: question.num_correct_answers})

            question.choices.forEach((choice_text, choice_index) => {
                const choice_container = $("<div/>", {class: "quiz-taker-choice"})
                    .append($("<input/>", {type: has_multiple_answers ? "checkbox" : "radio", name: question_index}).data("choice_index", choice_index))  
                    .append($("<span/>", {text: " " + choice_text}))

                fs.append(choice_container)
            })

            quiz_taker_row.append(fs)
        })
    },

    async checkGuesses(e) {
        e.preventDefault()

        const quiz_id = Number(window.location.hash.split("#")[2]),
              quiz_data = await api.getQuiz(quiz_id)

        // ensure that questions with multiple correct answers have exactly the right amount of answers checked
        let ok = true
        $(".quiz-taker-question").each((q_i, q_e) => {
            const n_required = $(q_e).data("n_answers")

            if($(q_e).find("input:checked").length != n_required) {
                alert(`Question number ${$(q_e).parent().children(".quiz-taker-question").index($(q_e)) + 1} requires ${n_required} answer(s).`)
                ok = false
            }
        })

        if (!ok) return;

        // reset background colors indicating previous attempts
        $(".quiz-taker-choice").css("background-color", $(document.body).css("background-color"))

        const payload = {
            quiz_id: quiz_id,
            guesses: [

            ]
        }

        // build a payload for api.checkGuesses based on the current DOM state
        $(".quiz-taker-question").each((question_index, question_element) => {
            if (quiz_data.questions[question_index].num_correct_answers > 1) {
                const temp = []
                $(question_element).find("input[type=checkbox]:checked").each((i, e) => {
                    temp.push($(e).data("choice_index"))
                })
                payload.guesses.push(temp)
            } else {
                payload.guesses.push($(question_element).find("input[type=radio]:checked").data("choice_index"))
            }
        })

        // submit paylaod, show the user the correct answers
        
        const response = await api.checkGuesses(payload)

        const color_right = "#2af413",
              color_wrong = "#f41313"

        response.answers.forEach((answer_data, answer_index) => {
            const current_answer = $(".quiz-taker-question").eq(answer_index)
            if (response.client_can_see_correct_answers) {
                if(Array.isArray(answer_data[0])) {
                    answer_data[0].forEach((correct_index, correct_index_i) => {
                        current_answer.children(".quiz-taker-choice").eq(correct_index).css("background-color", color_right)
                    })

                    answer_data.slice(1).forEach((correct, correct_i) => {
                        if(!correct) {
                            current_answer.find("input[type=checkbox]:checked").eq(correct_i).parent().css("background-color", color_wrong)
                        }
                    })
                } else {
                    if(answer_data[0]) { 
                        current_answer.find("input[type=radio]:checked").parent().css("background-color", color_right)
                    } else {
                        current_answer.find("input[type=radio]:checked").parent().css("background-color", color_wrong)
                        current_answer.children(".quiz-taker-choice").eq(answer_data[1]).css("background-color", color_right)
                    }
                }
            } else {
                if (Array.isArray(answer_data)) {
                    // current answer refers to a multi-choice question
                    answer_data.forEach((correct, choice_i) => {
                        current_answer.find("input[type=checkbox]:checked").eq(choice_i).parent().css("background-color", correct ? color_right : color_wrong)
                    })
                } else {
                    // current answer refers to a single-choice question
                    current_answer.find("input[type=radio]:checked").parent().css("background-color", answer_data ? color_right : color_wrong)
                }
            }
        })
    },

    helpers: {
        choiceTextEventHandler(e) {
            const len = $(e.target).val().length,
                  index = $(e.target).parents().eq(1).children(".quiz-maker-choice-checkbox-combo").index($(e.target).parent()),
                  n_siblings = $(e.target).parent().siblings(".quiz-maker-choice-checkbox-combo").length
            if (len > 0 && n_siblings == index) {
                // add new combo div 
                const newDiv = $("<div>", {
                    class: "quiz-maker-choice-checkbox-combo"
                }), newInput = $("<input>", {
                    type: "text",
                    class: "quiz-maker-question-choice-text-input",
                    placeholder: "..."
                }), newCheckbox = $("<input>", {
                    type: "checkbox"
                })

                newDiv.append(newInput, newCheckbox)
                $(e.target).parent().parent().append(newDiv)
            } else if (len == 0 && $(e.target).parent().next().length && $(e.target).parent().next().find('input[type=text]').val().length == 0) {
                if (index == n_siblings - 1) {
                    $(e.target).parent().remove()
                } else {
                    $(e.target).parent().siblings(".quiz-maker-choice-checkbox-combo").last().remove()
                }
            }
        }, 

        questionTextEventHandler(e) {
            const len = $(e.target).val().length,
                  index = $(e.target).parents().eq(2).children(".quiz-maker-question").index($(e.target).parents().eq(1)),
                  n_siblings = $(e.target).parents().eq(1).siblings(".quiz-maker-question").length

            if (len > 0 && n_siblings == index) {
                const newQuestion = $("<fieldset/>", {
                    class: "col quiz-maker-question"
                }).append("<h5>Question</h5>")

                const qDiv = $("<div/>")
                qDiv.append($("<span/>", {text: "Question text:", class: "bold"}))
                qDiv.append($("<br/>"))
                qDiv.append($("<input/>", {type: "text", class: "quiz-maker-question-text-input"}))
                qDiv.append($("<br/>"))

                const cDiv = $("<div/>")
                cDiv.append($("<span/>", {class: "bold", text: "Choices: "}))
                const cDivInner = $("<div/>", {class: "quiz-maker-choice-checkbox-combo"})
                cDivInner.append($("<input/>", {type: "text", placeholder: "...", class: "quiz-maker-question-choice-text-input"}))
                cDivInner.append($("<input/>", {type: "checkbox"}))

                cDiv.append(cDivInner)
                newQuestion.append(qDiv, cDiv)

                $(e.target).parents().eq(2).append(newQuestion)
            } else if (len == 0 && index != n_siblings) {
                $(e.target).parents().eq(1).last().remove()
            }
        },

        quizCardClickHandler(e) {
            const quiz_id = $(e.target).data("quiz_id")
            window.location.hash = `quiz#${quiz_id}`
        },
        
        resetRootColor() {
            $(document.body).css("background-color", "#ffffff")
        }
    }
}

$(document).ready(() => {
    window.onhashchange = app.locationHashChanged
    app.locationHashChanged() // initial call, useful when the page is reloaded or if the user wants to manually access a particular quiz etc...

    // quiz submittion input field bindings
    $(document).on('keyup', ".quiz-maker-question-choice-text-input", app.helpers.choiceTextEventHandler)
    $(document).on('keyup', ".quiz-maker-question-text-input", app.helpers.questionTextEventHandler)

    // quiz submittion submit button binding
    $("#submit_new_quiz").click(app.submitNewQuiz)

    // quiz card select binding
    $(document).on('click', ".quiz-browser-card", app.helpers.quizCardClickHandler)

    // quiz check answers button binding
    $("#quiz-taker-submit").click(app.checkGuesses)
})
