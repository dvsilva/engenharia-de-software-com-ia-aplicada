package httpapi

import (
	"encoding/json"
	"errors"
	"net/http"

	"notas-api/internal/domain"
	"notas-api/internal/service"
)

type httpErrorBody struct {
	Error  string   `json:"error"`
	Issues []string `json:"issues,omitzero"`
}

type httpErrorResponse struct {
	statusCode int
	body       httpErrorBody
}

func validationFailed(issues []string) httpErrorResponse {
	return httpErrorResponse{
		statusCode: http.StatusBadRequest,
		body:       httpErrorBody{Error: "Validation failed", Issues: issues},
	}
}

func toHTTPErrorResponse(err error) httpErrorResponse {
	if validationError, isValidation := errors.AsType[*domain.ValidationError](err); isValidation {
		return validationFailed(validationError.Issues)
	}

	if validationError, isValidation := errors.AsType[*service.TaskValidationError](err); isValidation {
		return validationFailed(validationError.Issues)
	}

	if notFoundError, isNotFound := errors.AsType[*service.TaskNotFoundError](err); isNotFound {
		return httpErrorResponse{
			statusCode: http.StatusNotFound,
			body:       httpErrorBody{Error: notFoundError.Error()},
		}
	}

	if _, isSyntax := errors.AsType[*json.SyntaxError](err); isSyntax {
		return httpErrorResponse{
			statusCode: http.StatusBadRequest,
			body:       httpErrorBody{Error: "Invalid JSON body"},
		}
	}

	return httpErrorResponse{
		statusCode: http.StatusInternalServerError,
		body:       httpErrorBody{Error: "Internal server error"},
	}
}
