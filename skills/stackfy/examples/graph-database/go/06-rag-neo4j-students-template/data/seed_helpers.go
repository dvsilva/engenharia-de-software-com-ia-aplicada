package data

import (
	"context"
	_ "embed"
	"encoding/json"
	"fmt"
	"math"
	"time"

	"github.com/brianvoe/gofakeit/v7"

	"rag-neo4j-students/src"
)

const studentCount = 20

const pastSpan = 365 * 24 * time.Hour

const isoMilliseconds = "2006-01-02T15:04:05.000Z"

//go:embed courses.json
var coursesFile []byte

type course struct {
	Name string `json:"name"`
	URL  string `json:"url"`
}

type testData struct {
	students        []map[string]any
	salesRecords    []map[string]any
	progressRecords []map[string]any
}

var batchStatements = []struct {
	cypher  string
	message string
}{
	{
		cypher: `UNWIND $batch AS row
        MERGE (c:Course {name: row.name})
        ON CREATE SET c.url = row.url`,
		message: "✅ Courses Inserted!",
	},
	{
		cypher: `UNWIND $batch AS row
        MERGE (s:Student {id: row.id})
        ON CREATE SET s.name = row.name, s.email = row.email, s.phone = row.phone`,
		message: "✅ Students Inserted!",
	},
	{
		cypher: `UNWIND $batch AS row
        MATCH (s:Student {id: row.studentId}), (c:Course {name: row.courseId})
        MERGE (s)-[p:PURCHASED]->(c)
        ON CREATE SET p.status = row.status, p.paymentMethod = row.paymentMethod, p.paymentDate = row.paymentDate, p.amount = row.amount
        ON MATCH SET p.status = row.status, p.paymentMethod = row.paymentMethod, p.paymentDate = row.paymentDate, p.amount = row.amount`,
		message: "✅ Sales Inserted!",
	},
	{
		cypher: `UNWIND $batch AS row
        MATCH (s:Student {id: row.studentId})-[:PURCHASED {status: "paid"}]->(c:Course {name: row.courseId})
        MERGE (s)-[p:PROGRESS]->(c)
        ON CREATE SET p.progress = row.progress
        ON MATCH SET p.progress = row.progress`,
		message: "✅ Progress Inserted!",
	},
}

func loadCourses() ([]course, error) {
	var courses []course
	err := json.Unmarshal(coursesFile, &courses)

	return courses, err
}

func pastDate() string {
	now := time.Now()

	return gofakeit.DateRange(now.Add(-pastSpan), now.Add(-time.Second)).UTC().Format(isoMilliseconds)
}

func generateSale(studentID string, courseNames []string) map[string]any {
	return map[string]any{
		"studentId":     studentID,
		"courseId":      gofakeit.RandomString(courseNames),
		"status":        gofakeit.RandomString([]string{"paid", "refunded"}),
		"paymentMethod": gofakeit.RandomString([]string{"pix", "credit_card"}),
		"paymentDate":   pastDate(),
		"amount":        math.Round(gofakeit.Float64Range(0, 2000)*100) / 100,
	}
}

func generateTestData(courses []course) testData {
	courseNames := make([]string, len(courses))
	for index, course := range courses {
		courseNames[index] = course.Name
	}

	data := testData{}

	for range studentCount {
		studentID := gofakeit.UUID()
		data.students = append(data.students, map[string]any{
			"id":    studentID,
			"name":  gofakeit.Name(),
			"email": gofakeit.Email(),
			"phone": gofakeit.Phone(),
		})

		for range gofakeit.IntRange(1, 10) {
			data.salesRecords = append(data.salesRecords, generateSale(studentID, courseNames))
		}
	}

	for _, sale := range data.salesRecords {
		if sale["status"] != "paid" {
			continue
		}

		data.progressRecords = append(data.progressRecords, map[string]any{
			"studentId": sale["studentId"],
			"courseId":  sale["courseId"],
			"progress":  float64(gofakeit.IntRange(0, 100)),
		})
	}

	return data
}

func coursesBatch(courses []course) []map[string]any {
	batch := make([]map[string]any, len(courses))
	for index, course := range courses {
		batch[index] = map[string]any{"name": course.Name, "url": course.URL}
	}

	return batch
}

func toParameter(rows []map[string]any) []any {
	parameter := make([]any, len(rows))
	for index, row := range rows {
		parameter[index] = row
	}

	return parameter
}

func SeedDatabase(ctx context.Context) error {
	neo4jService := src.NewNeo4jService()
	defer neo4jService.Close(ctx)

	courses, err := loadCourses()
	if err != nil {
		return err
	}

	fmt.Println("🧹 Clearing database...")
	if err := neo4jService.ClearDatabase(ctx); err != nil {
		return err
	}
	fmt.Println("✅ Database cleared!")

	data := generateTestData(courses)
	batches := [][]map[string]any{coursesBatch(courses), data.students, data.salesRecords, data.progressRecords}

	for index, statement := range batchStatements {
		if _, err := neo4jService.Query(ctx, statement.cypher, map[string]any{"batch": toParameter(batches[index])}); err != nil {
			return err
		}
		fmt.Println(statement.message)
	}

	return nil
}
