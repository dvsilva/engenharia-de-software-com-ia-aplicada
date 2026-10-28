package util

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"os"
	"strconv"

	"alumnus/src/types"
)

func environmentOr(name string, fallback string) string {
	if value, found := os.LookupEnv(name); found && value != "" {
		return value
	}

	return fallback
}

func portOr(name string, fallback int) (int, error) {
	text := environmentOr(name, strconv.Itoa(fallback))

	port, err := strconv.Atoi(text)
	if err != nil || port < 0 || port > 65535 {
		return 0, fmt.Errorf(`env-var: "%s" should be a valid port number, but was "%s"`, name, text)
	}

	return port, nil
}

func randomAppID() string {
	bytes := make([]byte, 2)
	rand.Read(bytes)

	return hex.EncodeToString(bytes)
}

func LoadConfig() (types.Config, error) {
	defaultAppName := "alumnus_app_" + randomAppID()

	port, err := portOr("PORT", 9000)
	if err != nil {
		return types.Config{}, err
	}

	return types.Config{
		Port:                        port,
		DatabaseURL:                 environmentOr("DATABASE_URL", "postgresql://alumnus:alumnus_dev_password@localhost:5433/"+defaultAppName),
		AppName:                     environmentOr("APPNAME", defaultAppName),
		OtelExporterOtlpEndpoint:    environmentOr("OTEL_EXPORTER_OTLP_ENDPOINT", "http://localhost:4317"),
		OtelExporterOtlpCompression: environmentOr("OTEL_EXPORTER_OTLP_COMPRESSION", "gzip"),
		OtelPropagators:             environmentOr("OTEL_PROPAGATORS", "tracecontext,baggage"),
		OtelMetricsExporter:         environmentOr("OTEL_METRICS_EXPORTER", "otlp"),
		NodeEnv:                     environmentOr("NODE_ENV", "production"),
		LogLevel:                    environmentOr("LOG_LEVEL", "info"),
	}, nil
}
