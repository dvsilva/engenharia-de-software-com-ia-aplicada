import sqlite3
from contextlib import closing

from lib.auth import auth
from lib.schema import INDEXES, TABLES


def existing(database: sqlite3.Connection, kind: str) -> set[str]:
    rows = database.execute(
        'SELECT name FROM sqlite_master WHERE type = ?', (kind,)
    ).fetchall()

    return {row[0] for row in rows}


def migrate() -> None:
    with closing(sqlite3.connect(auth.database, isolation_level=None)) as database:
        tables = existing(database, 'table')
        indexes = existing(database, 'index')
        missing = [sql for name, sql in TABLES.items() if name not in tables]
        missing += [sql for name, sql in INDEXES.items() if name not in indexes]

        if not missing:
            print('No migrations needed.')
            return

        database.executescript(';\n'.join(missing))

    print('migration was completed successfully!')


if __name__ == '__main__':
    migrate()
