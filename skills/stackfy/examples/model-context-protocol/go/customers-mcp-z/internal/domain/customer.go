package domain

import "github.com/google/jsonschema-go/jsonschema"

type CustomerFields struct {
	Name  *string `json:"name,omitempty"`
	Phone *string `json:"phone,omitempty"`
}

type CustomerQuery struct {
	ID *string `json:"_id,omitempty"`
	CustomerFields
}

type CustomerUpdate struct {
	ID string `json:"_id"`
	CustomerFields
}

type NewCustomer struct {
	Name  string `json:"name"`
	Phone string `json:"phone"`
}

var CustomerQueryFields = []string{"_id", "name", "phone"}

func Text(description string) *jsonschema.Schema {
	return &jsonschema.Schema{Type: "string", Description: description}
}

func Object(properties map[string]*jsonschema.Schema, required ...string) *jsonschema.Schema {
	return &jsonschema.Schema{Type: "object", Properties: properties, Required: required}
}

func Described(schema *jsonschema.Schema, description string) *jsonschema.Schema {
	schema.Description = description

	return schema
}

func CustomerSchema() *jsonschema.Schema {
	return Object(map[string]*jsonschema.Schema{
		"_id":   Text(""),
		"name":  Text(""),
		"phone": Text(""),
	}, "name", "phone")
}

func CustomerQueryProperties() map[string]*jsonschema.Schema {
	return map[string]*jsonschema.Schema{
		"_id":   Text("MongoDB ObjectId of the customer"),
		"name":  Text("Full name of the customer"),
		"phone": Text("phone number of the customer"),
	}
}

func CustomerQuerySchema() *jsonschema.Schema {
	return Object(CustomerQueryProperties())
}

func CustomerUpdateSchema() *jsonschema.Schema {
	return Object(CustomerQueryProperties(), "_id")
}

// The SDK validates results against these schemas, which leave additional
// properties open, as zod's check does.
func CustomerMutationSchema() *jsonschema.Schema {
	return Object(map[string]*jsonschema.Schema{
		"id":        Text("MongoDB ObjectId of the customer"),
		"message":   Text("Confirmation message"),
		"isError":   {Type: "boolean", Description: "Indicates if an error occurred"},
		"customer":  Described(CustomerSchema(), "The found customer"),
		"customers": {Type: "array", Items: CustomerSchema(), Description: "List of customers"},
	})
}
