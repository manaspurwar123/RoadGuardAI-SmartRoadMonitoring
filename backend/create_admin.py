
import sqlite3
from getpass import getpass

from auth import init_auth_db, create_admin

def main():
    init_auth_db()

    print("=== RoadGuard AI Admin Setup ===")

    username = input("Enter admin username: ").strip()

    password = getpass("Enter admin password: ")
    confirm = getpass("Confirm password: ")

    if password != confirm:
        print("Passwords do not match.")
        return

    try:
        create_admin(username, password)
        print("Admin account created successfully!")

    except sqlite3.IntegrityError:
        print("Username already exists.")

    except ValueError as error:
        print(error)


if __name__ == "__main__":
    main()
