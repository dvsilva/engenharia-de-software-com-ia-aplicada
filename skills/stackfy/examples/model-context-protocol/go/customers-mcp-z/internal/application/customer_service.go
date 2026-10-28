package application

import (
	"encoding/json"
	"strings"

	"customers-mcp/internal/domain"
	"customers-mcp/internal/infrastructure"
)

type CustomerService struct {
	client *infrastructure.CustomerHTTPClient
}

func NewCustomerService(baseURL string) *CustomerService {
	return &CustomerService{client: infrastructure.NewCustomerHTTPClient(baseURL)}
}

func (service *CustomerService) ListCustomers() ([]json.RawMessage, error) {
	return service.client.ListCustomers()
}

func (service *CustomerService) CreateCustomer(customer domain.NewCustomer) (json.RawMessage, error) {
	return service.client.CreateCustomer(customer)
}

func searchedFields(query domain.CustomerQuery) map[string]string {
	fields := map[string]string{}
	given := map[string]*string{"_id": query.ID, "name": query.Name, "phone": query.Phone}

	for name, value := range given {
		if value != nil {
			fields[name] = *value
		}
	}

	return fields
}

func containsEvery(customer json.RawMessage, fields map[string]string) bool {
	var document map[string]any
	if err := json.Unmarshal(customer, &document); err != nil {
		return false
	}

	for name, text := range fields {
		value, isText := document[name].(string)
		if !isText || !strings.Contains(value, text) {
			return false
		}
	}

	return true
}

// A nil customer stands for none found, which the tool answers as null.
func (service *CustomerService) FindCustomer(query domain.CustomerQuery) (json.RawMessage, error) {
	if query.ID != nil && *query.ID != "" {
		return service.client.GetCustomerByID(*query.ID)
	}

	customers, err := service.client.ListCustomers()
	if err != nil {
		return nil, err
	}

	fields := searchedFields(query)
	for _, customer := range customers {
		if containsEvery(customer, fields) {
			return customer, nil
		}
	}

	return nil, nil
}

func (service *CustomerService) UpdateCustomer(customer domain.CustomerUpdate) (json.RawMessage, error) {
	return service.client.UpdateCustomer(customer)
}

func (service *CustomerService) DeleteCustomer(id string) (json.RawMessage, error) {
	return service.client.DeleteCustomer(id)
}
