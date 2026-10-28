package src

import (
	"context"
	"fmt"
	"os"
	"strings"
	"sync"

	"github.com/neo4j/neo4j-go-driver/v5/neo4j"
)

var excludedLabels = []any{"Bloom_Perspective", "Bloom_Scene", "__Entity__"}

var excludedRelationships = []any{"Bloom_HAS_SCENE"}

const nodePropertiesQuery = `
CALL apoc.meta.data()
YIELD label, other, elementType, type, property
WHERE NOT type = "RELATIONSHIP" AND elementType = "node"
  AND NOT label IN $EXCLUDED_LABELS
WITH label AS nodeLabels, collect({property:property, type:type}) AS properties
RETURN {labels: nodeLabels, properties: properties} AS output
`

const relationshipPropertiesQuery = `
CALL apoc.meta.data()
YIELD label, other, elementType, type, property
WHERE NOT type = "RELATIONSHIP" AND elementType = "relationship"
      AND NOT label in $EXCLUDED_LABELS
WITH label AS nodeLabels, collect({property:property, type:type}) AS properties
RETURN {type: nodeLabels, properties: properties} AS output
`

const relationshipsQuery = `
CALL apoc.meta.data()
YIELD label, other, elementType, type, property
WHERE type = "RELATIONSHIP" AND elementType = "node"
UNWIND other AS other_node
WITH * WHERE NOT label IN $EXCLUDED_LABELS
    AND NOT other_node IN $EXCLUDED_LABELS
RETURN {start: label, type: property, end: toString(other_node)} AS output
`

type Neo4jService struct {
	mutex  sync.Mutex
	driver neo4j.DriverWithContext
	schema string
}

func NewNeo4jService() *Neo4jService {
	return &Neo4jService{}
}

func (service *Neo4jService) getDriver(ctx context.Context) (neo4j.DriverWithContext, error) {
	service.mutex.Lock()
	defer service.mutex.Unlock()

	if service.driver != nil {
		return service.driver, nil
	}

	driver, err := neo4j.NewDriverWithContext(
		Config.Neo4j.URI,
		neo4j.BasicAuth(Config.Neo4j.Username, Config.Neo4j.Password, ""),
	)
	if err != nil {
		return nil, err
	}
	if err := driver.VerifyConnectivity(ctx); err != nil {
		_ = driver.Close(ctx)
		return nil, err
	}

	schema, err := readSchema(ctx, driver)
	if err != nil {
		_ = driver.Close(ctx)
		return nil, err
	}

	service.driver = driver
	service.schema = schema

	return driver, nil
}

func run(ctx context.Context, driver neo4j.DriverWithContext, cypherQuery string, parameters map[string]any) (*neo4j.EagerResult, error) {
	return neo4j.ExecuteQuery(ctx, driver, cypherQuery, parameters, neo4j.EagerResultTransformer, neo4j.ExecuteQueryWithDatabase("neo4j"))
}

func outputs(ctx context.Context, driver neo4j.DriverWithContext, cypherQuery string, excluded []any) ([]map[string]any, error) {
	result, err := run(ctx, driver, cypherQuery, map[string]any{"EXCLUDED_LABELS": excluded})
	if err != nil {
		return nil, err
	}

	rows := make([]map[string]any, len(result.Records))
	for index, record := range result.Records {
		output, _ := record.Get("output")
		rows[index], _ = output.(map[string]any)
	}

	return rows, nil
}

func formatProperties(properties any, separator, closing string) string {
	list, _ := properties.([]any)
	items := make([]string, len(list))
	for index, item := range list {
		property, _ := item.(map[string]any)
		items[index] = fmt.Sprintf("%v: %v%s", property["property"], property["type"], separator)
	}

	return strings.Join(items, ", ") + closing
}

func readSchema(ctx context.Context, driver neo4j.DriverWithContext) (string, error) {
	nodes, err := outputs(ctx, driver, nodePropertiesQuery, excludedLabels)
	if err != nil {
		return "", err
	}
	relationshipProperties, err := outputs(ctx, driver, relationshipPropertiesQuery, excludedRelationships)
	if err != nil {
		return "", err
	}
	relationships, err := outputs(ctx, driver, relationshipsQuery, excludedLabels)
	if err != nil {
		return "", err
	}

	formattedNodes := make([]string, len(nodes))
	for index, node := range nodes {
		formattedNodes[index] = fmt.Sprintf("%v {%s", node["labels"], formatProperties(node["properties"], "", "}"))
	}

	formattedProperties := make([]string, len(relationshipProperties))
	for index, relationship := range relationshipProperties {
		formattedProperties[index] = fmt.Sprintf("%v {%s", relationship["type"], formatProperties(relationship["properties"], " ", " } "))
	}

	formattedRelationships := make([]string, len(relationships))
	for index, relationship := range relationships {
		formattedRelationships[index] = fmt.Sprintf("(: %v) - [: %v] -> (:%v)", relationship["start"], relationship["type"], relationship["end"])
	}

	return strings.Join([]string{
		"Node properties are the following:",
		strings.Join(formattedNodes, ", "),
		"Relationship properties are the following:",
		strings.Join(formattedProperties, ", "),
		"The relationships are the following:",
		strings.Join(formattedRelationships, ", "),
	}, "\n"), nil
}

func (service *Neo4jService) GetSchema(ctx context.Context) string {
	if _, err := service.getDriver(ctx); err != nil {
		fmt.Fprintln(os.Stderr, "❌ Error getting schema:", err)
		return ""
	}

	return service.schema
}

func (service *Neo4jService) ValidateQuery(ctx context.Context, query string) bool {
	driver, err := service.getDriver(ctx)
	if err == nil {
		_, err = run(ctx, driver, "EXPLAIN "+query, nil)
	}
	if err != nil {
		fmt.Fprintln(os.Stderr, "❌ Query validation failed:", err)
		return false
	}

	return true
}

func (service *Neo4jService) Query(ctx context.Context, cypherQuery string, parameters map[string]any) ([]Row, error) {
	driver, err := service.getDriver(ctx)
	if err == nil {
		var result *neo4j.EagerResult
		result, err = run(ctx, driver, cypherQuery, parameters)
		if err == nil {
			return toRows(result.Records), nil
		}
	}

	fmt.Fprintln(os.Stderr, "❌ Error executing query:", err)

	return nil, err
}

func (service *Neo4jService) ClearDatabase(ctx context.Context) error {
	if _, err := service.Query(ctx, "MATCH (n) DETACH DELETE n", nil); err != nil {
		fmt.Fprintln(os.Stderr, "❌ Error clearing database:", err)
		return err
	}

	fmt.Println("✅ Database cleared")

	return nil
}

func (service *Neo4jService) Close(ctx context.Context) error {
	service.mutex.Lock()
	defer service.mutex.Unlock()

	if service.driver == nil {
		return nil
	}

	err := service.driver.Close(ctx)
	service.driver = nil

	return err
}
