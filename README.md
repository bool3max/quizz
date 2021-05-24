# Quizz

This repository contains the source code of a simple web quiz-like web application written for a school project.

## Requirements

* Python3
* Flask
* SQLite3

It's recommended to install Flask in a Python3 virtual environment (`venv`) specific to the project. Git repositories don't usually commit
Python3 venvs:

```
$ python3 -m venv <venv_name>
$ source ./<venv_name>/bin/activate
$ pip install flask
```

## Quickstart

1. Use the provided schema file to create a blank database: 

    ```
    $ sqlite3 <name>.db

    sqlite> .read src/db.schema
    sqlite> .exit
    ```
2. Run the Flask debug server (a Werkzeug server only to be used during development/debugging):

    The environment variable `DB_PATH` points to the database file created in step 1.

    ```
    $ env FLASK_APP=src/quiz_main.py FLASK_ENV=development DB_PATH=<name.db> flask run
    ```

3. Visit the app locally on `http://localhost:5000`. The port that the Werkzeug development server listens on can be changed.

## Caveats

* The `quiz_client_should_see_correct_answers` column in the `quizzes` table is not modifiable by the client during the creation of a quiz, and as such defaults to `1` (`True`) in SQLite. The client implementation
however fully supports this field, and it is returned by the server when a particular quiz is loaded. I may make it modifiable in the future.

* The `quiz_client_should_randomize_order` column in the `quizzes` table currently has no effect. The user can alter its value during the creation of a new quiz, and its value is returned by the API, however
it has no effect on the order of the questions in the rendered DOM. I may implement support for it in the future.
