package database

import (
	"context"
	"net/url"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"alumnus/src/types"
)

func adminURL(databaseURL string) (string, string, error) {
	parsed, err := url.Parse(databaseURL)
	if err != nil {
		return "", "", err
	}

	databaseName := strings.TrimPrefix(parsed.Path, "/")
	parsed.Path = "/postgres"

	return parsed.String(), databaseName, nil
}

func CreateDatabase(ctx context.Context, databaseURL string) error {
	administration, databaseName, err := adminURL(databaseURL)
	if err != nil {
		return err
	}

	adminDb, err := pgx.Connect(ctx, administration)
	if err != nil {
		return err
	}
	defer adminDb.Close(ctx)

	rows, err := adminDb.Query(ctx, "SELECT 1 FROM pg_database WHERE datname = $1", databaseName)
	if err != nil {
		return err
	}

	found := rows.Next()
	rows.Close()
	if found {
		return nil
	}

	_, err = adminDb.Exec(ctx, "CREATE DATABASE "+pgx.Identifier{databaseName}.Sanitize())
	return err
}

func Connect(ctx context.Context, databaseURL string) (*pgxpool.Pool, error) {
	if err := CreateDatabase(ctx, databaseURL); err != nil {
		return nil, err
	}

	poolConfig, err := pgxpool.ParseConfig(databaseURL)
	if err != nil {
		return nil, err
	}

	poolConfig.ConnConfig.RuntimeParams["search_path"] = "knex,public"

	db, err := pgxpool.NewWithConfig(ctx, poolConfig)
	if err != nil {
		return nil, err
	}

	if _, err := db.Exec(ctx, "SELECT 1 as result"); err != nil {
		db.Close()
		return nil, err
	}

	return db, nil
}

func DropDatabase(ctx context.Context, databaseURL string) error {
	administration, databaseName, err := adminURL(databaseURL)
	if err != nil {
		return err
	}

	adminDb, err := pgx.Connect(ctx, administration)
	if err != nil {
		return err
	}
	defer adminDb.Close(ctx)

	_, err = adminDb.Exec(ctx, `
		SELECT pg_terminate_backend(pg_stat_activity.pid)
		FROM pg_stat_activity
		WHERE pg_stat_activity.datname = $1
			AND pid <> pg_backend_pid()
	`, databaseName)
	if err != nil {
		return err
	}

	_, err = adminDb.Exec(ctx, "DROP DATABASE IF EXISTS "+pgx.Identifier{databaseName}.Sanitize())
	return err
}

func SeedDb(ctx context.Context, db *pgxpool.Pool) error {
	statements := []string{
		`DROP TABLE IF EXISTS "courses"`,
		`DROP TABLE IF EXISTS "students"`,
		`CREATE TABLE "courses" ("id" serial PRIMARY KEY, "name" varchar(255))`,
		`CREATE TABLE "students" (
			"id" serial PRIMARY KEY,
			"name" varchar(255),
			"courseId" integer,
			CONSTRAINT "fk_fkey_courses" FOREIGN KEY ("courseId") REFERENCES "courses" ("id")
		)`,
		`INSERT INTO "courses" ("name") VALUES ('Node.js Streams'), ('JavaScript Expert')`,
		`INSERT INTO "students" ("name", "courseId") VALUES ('Nightcrawler', 1)`,
		`SELECT * FROM "courses"`,
		`SELECT * FROM "students"`,
	}

	for _, statement := range statements {
		if _, err := db.Exec(ctx, statement); err != nil {
			return err
		}
	}

	return nil
}

func SelectAllBadQuery(ctx context.Context, db *pgxpool.Pool) ([]types.Student, error) {
	rows, err := db.Query(ctx, `SELECT * FROM "students"`)
	if err != nil {
		return nil, err
	}

	students, err := pgx.CollectRows(rows, pgx.RowToStructByNameLax[types.Student])
	if err != nil {
		return nil, err
	}

	for index, student := range students {
		var course string
		if err := db.QueryRow(ctx, `SELECT "name" FROM "courses" WHERE "id" = $1 LIMIT 1`, student.CourseID).Scan(&course); err != nil {
			return nil, err
		}

		students[index].Course = course
		students[index].CourseID = nil
	}

	return students, nil
}

func SelectAllGoodQuery(ctx context.Context, db *pgxpool.Pool) ([]types.Student, error) {
	rows, err := db.Query(ctx, `
		SELECT "students"."id", "students"."name", "courses"."name" AS "course"
		FROM "students"
		INNER JOIN "courses" ON "courses"."id" = "students"."courseId"
	`)
	if err != nil {
		return nil, err
	}

	return pgx.CollectRows(rows, pgx.RowToStructByNameLax[types.Student])
}
