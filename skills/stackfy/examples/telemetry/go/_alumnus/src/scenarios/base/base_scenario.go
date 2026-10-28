package base

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5/pgxpool"

	"alumnus/src/types"
)

type Hooks interface {
	OnInit(app types.AppInstance, config types.Config, db *pgxpool.Pool) error
	OnRegisterRoutes(app types.AppInstance, config types.Config, db *pgxpool.Pool)
	OnTerminate(ctx context.Context, app types.AppInstance)
}

type BaseScenario struct {
	Name        string
	initialized bool
	hooks       Hooks
}

func NewBaseScenario(name string, hooks Hooks) *BaseScenario {
	return &BaseScenario{Name: name, hooks: hooks}
}

func (scenario *BaseScenario) Init(app types.AppInstance, config types.Config, db *pgxpool.Pool) error {
	if scenario.initialized {
		app.Log.Warn(fmt.Sprintf("Scenario %s already initialized", scenario.Name))
		return nil
	}

	app.Log.Info("Initializing scenario: " + scenario.Name)
	if err := scenario.hooks.OnInit(app, config, db); err != nil {
		return err
	}

	scenario.initialized = true
	app.Log.Info(fmt.Sprintf("Scenario %s initialized successfully", scenario.Name))

	return nil
}

func (scenario *BaseScenario) RegisterRoutes(app types.AppInstance, config types.Config, db *pgxpool.Pool) error {
	if !scenario.initialized {
		return fmt.Errorf("Scenario %s must be initialized before registering routes", scenario.Name)
	}

	app.Log.Info("Registering routes for scenario: " + scenario.Name)
	scenario.hooks.OnRegisterRoutes(app, config, db)
	app.Log.Info("Routes registered for scenario: " + scenario.Name)

	return nil
}

func (scenario *BaseScenario) Terminate(ctx context.Context, app types.AppInstance) {
	if !scenario.initialized {
		app.Log.Warn(fmt.Sprintf("Scenario %s not initialized, skipping termination", scenario.Name))
		return
	}

	app.Log.Info("Terminating scenario: " + scenario.Name)
	scenario.hooks.OnTerminate(ctx, app)
	scenario.initialized = false
	app.Log.Info(fmt.Sprintf("Scenario %s terminated successfully", scenario.Name))
}
