package src

import (
	"context"
	"fmt"
	"os"
	"sync"

	"github.com/neo4j/neo4j-go-driver/v5/neo4j"
)

type Neo4jService struct {
	mutex  sync.Mutex
	driver neo4j.DriverWithContext
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

	service.driver = driver

	return driver, nil
}

func (service *Neo4jService) Query(ctx context.Context, cypherQuery string, parameters map[string]any) ([]map[string]any, error) {
	driver, err := service.getDriver(ctx)
	if err != nil {
		fmt.Fprintln(os.Stderr, "❌ Error executing query:", err)
		return nil, err
	}

	result, err := neo4j.ExecuteQuery(ctx, driver, cypherQuery, parameters, neo4j.EagerResultTransformer, neo4j.ExecuteQueryWithDatabase("neo4j"))
	if err != nil {
		fmt.Fprintln(os.Stderr, "❌ Error executing query:", err)
		return nil, err
	}

	rows := make([]map[string]any, len(result.Records))
	for index, record := range result.Records {
		rows[index] = record.AsMap()
	}

	return rows, nil
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
