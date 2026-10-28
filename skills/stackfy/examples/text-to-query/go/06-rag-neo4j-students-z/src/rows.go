package src

import (
	"bytes"
	"encoding/json"
	"fmt"
	"strconv"
	"strings"

	"github.com/neo4j/neo4j-go-driver/v5/neo4j"
)

type Row struct {
	keys   []string
	values map[string]any
}

func plainValue(value any) any {
	switch typed := value.(type) {
	case nil, string, bool, float64:
		return typed
	case int64:
		return strconv.FormatInt(typed, 10)
	case []any:
		items := make([]any, len(typed))
		for index, item := range typed {
			items[index] = plainValue(item)
		}
		return items
	case map[string]any:
		return plainMap(typed)
	case neo4j.Node:
		return plainMap(typed.Props)
	case neo4j.Relationship:
		return plainMap(typed.Props)
	default:
		return fmt.Sprint(typed)
	}
}

func plainMap(properties map[string]any) map[string]any {
	converted := make(map[string]any, len(properties))
	for key, value := range properties {
		converted[key] = plainValue(value)
	}

	return converted
}

func toRows(records []*neo4j.Record) []Row {
	rows := make([]Row, len(records))
	for index, record := range records {
		values := make(map[string]any, len(record.Keys))
		for position, key := range record.Keys {
			values[key] = plainValue(record.Values[position])
		}
		rows[index] = Row{keys: record.Keys, values: values}
	}

	return rows
}

func encode(value any) string {
	var buffer bytes.Buffer
	encoder := json.NewEncoder(&buffer)
	encoder.SetEscapeHTML(false)
	_ = encoder.Encode(value)

	return strings.TrimSuffix(buffer.String(), "\n")
}

func (row Row) MarshalJSON() ([]byte, error) {
	fields := make([]string, len(row.keys))
	for index, key := range row.keys {
		fields[index] = encode(key) + ":" + encode(row.values[key])
	}

	return []byte("{" + strings.Join(fields, ",") + "}"), nil
}

func stringify(rows []Row) string {
	if rows == nil {
		rows = []Row{}
	}

	return encode(rows)
}
