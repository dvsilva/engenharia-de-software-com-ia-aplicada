package types

import (
	"log/slog"
	"net/http"
)

type Config struct {
	NodeEnv                     string
	Port                        int
	LogLevel                    string
	DatabaseURL                 string
	AppName                     string
	OtelExporterOtlpEndpoint    string
	OtelExporterOtlpCompression string
	OtelPropagators             string
	OtelMetricsExporter         string
}

type AppInstance struct {
	Router *http.ServeMux
	Log    *slog.Logger
}

type Student struct {
	ID       int    `json:"id" db:"id"`
	Name     string `json:"name" db:"name"`
	CourseID *int   `json:"courseId,omitempty" db:"courseId"`
	Course   string `json:"course,omitempty" db:"course"`
}
