package infrastructure

import (
	"bytes"
	"encoding/json"
	"net/http"

	"customers-mcp/internal/domain"
)

type CustomerHTTPClient struct {
	baseURL string
}

func NewCustomerHTTPClient(baseURL string) *CustomerHTTPClient {
	return &CustomerHTTPClient{baseURL: baseURL}
}

func decode(response *http.Response, err error) (json.RawMessage, error) {
	if err != nil {
		return nil, err
	}
	defer response.Body.Close()

	var body json.RawMessage
	if err := json.NewDecoder(response.Body).Decode(&body); err != nil {
		return nil, err
	}

	return body, nil
}

func send(method string, url string, payload any) (*http.Response, error) {
	var body bytes.Buffer
	if payload != nil {
		if err := json.NewEncoder(&body).Encode(payload); err != nil {
			return nil, err
		}
	}

	request, err := http.NewRequest(method, url, &body)
	if err != nil {
		return nil, err
	}
	if payload != nil {
		request.Header.Set("Content-Type", "application/json")
	}

	return http.DefaultClient.Do(request)
}

func (client *CustomerHTTPClient) customerURL(id string) string {
	return client.baseURL + "/customers/" + id
}

func (client *CustomerHTTPClient) ListCustomers() ([]json.RawMessage, error) {
	body, err := decode(http.Get(client.baseURL + "/customers"))
	if err != nil {
		return nil, err
	}

	customers := []json.RawMessage{}
	if err := json.Unmarshal(body, &customers); err != nil {
		return nil, err
	}

	return customers, nil
}

func (client *CustomerHTTPClient) CreateCustomer(customer domain.NewCustomer) (json.RawMessage, error) {
	return decode(send(http.MethodPost, client.baseURL+"/customers", customer))
}

func (client *CustomerHTTPClient) GetCustomerByID(id string) (json.RawMessage, error) {
	response, err := http.Get(client.customerURL(id))
	if err != nil {
		return nil, err
	}
	if response.StatusCode == http.StatusNotFound {
		response.Body.Close()

		return nil, nil
	}

	return decode(response, nil)
}

func (client *CustomerHTTPClient) UpdateCustomer(customer domain.CustomerUpdate) (json.RawMessage, error) {
	return decode(send(http.MethodPut, client.customerURL(customer.ID), customer.CustomerFields))
}

func (client *CustomerHTTPClient) DeleteCustomer(id string) (json.RawMessage, error) {
	return decode(send(http.MethodDelete, client.customerURL(id), nil))
}
