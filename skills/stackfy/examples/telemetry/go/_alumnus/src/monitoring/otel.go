package monitoring

import (
	"context"
	"errors"
	"log/slog"
	"os"
	"time"

	"go.opentelemetry.io/contrib/bridges/otelslog"
	"go.opentelemetry.io/contrib/instrumentation/runtime"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/exporters/otlp/otlplog/otlploggrpc"
	"go.opentelemetry.io/otel/exporters/otlp/otlpmetric/otlpmetricgrpc"
	"go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracegrpc"
	"go.opentelemetry.io/otel/log/global"
	"go.opentelemetry.io/otel/propagation"
	sdklog "go.opentelemetry.io/otel/sdk/log"
	sdkmetric "go.opentelemetry.io/otel/sdk/metric"
	"go.opentelemetry.io/otel/sdk/resource"
	sdktrace "go.opentelemetry.io/otel/sdk/trace"
	semconv "go.opentelemetry.io/otel/semconv/v1.40.0"

	"alumnus/src/types"
)

var shutdowns []func(context.Context) error

var logLevels = map[string]slog.Level{
	"trace": slog.LevelDebug,
	"debug": slog.LevelDebug,
	"info":  slog.LevelInfo,
	"warn":  slog.LevelWarn,
	"error": slog.LevelError,
	"fatal": slog.LevelError,
}

func newResource(ctx context.Context, config types.Config) (*resource.Resource, error) {
	return resource.New(
		ctx,
		resource.WithAttributes(semconv.ServiceName(config.AppName)),
		resource.WithTelemetrySDK(),
		resource.WithHost(),
		resource.WithProcess(),
	)
}

func newLogger(config types.Config, loggerProvider *sdklog.LoggerProvider) *slog.Logger {
	consoleHandler := slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: logLevels[config.LogLevel]})
	telemetryHandler := otelslog.NewHandler("alumnus", otelslog.WithLoggerProvider(loggerProvider))

	return slog.New(slog.NewMultiHandler(consoleHandler, telemetryHandler))
}

func InitOtel(ctx context.Context, config types.Config) (*slog.Logger, error) {
	otel.SetErrorHandler(otel.ErrorHandlerFunc(func(err error) {
		slog.New(slog.NewTextHandler(os.Stderr, nil)).Error(err.Error())
	}))

	telemetryResource, err := newResource(ctx, config)
	if err != nil {
		return nil, err
	}

	traceExporter, err := otlptracegrpc.New(
		ctx,
		otlptracegrpc.WithEndpointURL(config.OtelExporterOtlpEndpoint),
		otlptracegrpc.WithCompressor(config.OtelExporterOtlpCompression),
	)
	if err != nil {
		return nil, err
	}

	metricExporter, err := otlpmetricgrpc.New(
		ctx,
		otlpmetricgrpc.WithEndpointURL(config.OtelExporterOtlpEndpoint),
		otlpmetricgrpc.WithCompressor(config.OtelExporterOtlpCompression),
	)
	if err != nil {
		return nil, err
	}

	logExporter, err := otlploggrpc.New(
		ctx,
		otlploggrpc.WithEndpointURL(config.OtelExporterOtlpEndpoint),
		otlploggrpc.WithCompressor(config.OtelExporterOtlpCompression),
	)
	if err != nil {
		return nil, err
	}

	tracerProvider := sdktrace.NewTracerProvider(
		sdktrace.WithResource(telemetryResource),
		sdktrace.WithBatcher(
			traceExporter,
			sdktrace.WithMaxQueueSize(2048),
			sdktrace.WithMaxExportBatchSize(512),
			sdktrace.WithBatchTimeout(5*time.Second),
			sdktrace.WithExportTimeout(30*time.Second),
		),
	)
	meterProvider := sdkmetric.NewMeterProvider(
		sdkmetric.WithResource(telemetryResource),
		sdkmetric.WithReader(sdkmetric.NewPeriodicReader(metricExporter, sdkmetric.WithInterval(3*time.Second))),
	)
	loggerProvider := sdklog.NewLoggerProvider(
		sdklog.WithResource(telemetryResource),
		sdklog.WithProcessor(sdklog.NewBatchProcessor(logExporter)),
	)

	otel.SetTracerProvider(tracerProvider)
	otel.SetMeterProvider(meterProvider)
	otel.SetTextMapPropagator(propagation.NewCompositeTextMapPropagator(propagation.TraceContext{}, propagation.Baggage{}))
	global.SetLoggerProvider(loggerProvider)

	if err := runtime.Start(runtime.WithMeterProvider(meterProvider)); err != nil {
		return nil, err
	}

	shutdowns = []func(context.Context) error{tracerProvider.Shutdown, meterProvider.Shutdown, loggerProvider.Shutdown}

	return newLogger(config, loggerProvider), nil
}

func ShutDownOtel(ctx context.Context) error {
	if shutdowns == nil {
		return errors.New("OpenTelemetry SDK not initialized")
	}

	var errs []error
	for _, shutdown := range shutdowns {
		errs = append(errs, shutdown(ctx))
	}

	return errors.Join(errs...)
}
