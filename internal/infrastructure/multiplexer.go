package infrastructure

import (
	"context"
	"database/sql"
	"fmt"
	"os"
	"time"

	wmill "github.com/windmill-labs/windmill-go-client"
	_ "github.com/lib/pq"
)

// obtenerSecreto lee de Xubuntu (DEV) o de la bóveda de Windmill (PROD)
func obtenerSecreto(rutaWindmill string, envLocal string) (string, error) {
	// Primero intentar variable de entorno local (DEV)
	if valorLocal := os.Getenv(envLocal); valorLocal != "" {
		return valorLocal, nil
	}

	// Fallback a Windmill (PROD)
	valorWindmill, err := wmill.GetVariable(rutaWindmill)
	if err != nil {
		return "", fmt.Errorf("fallo crítico al extraer secreto %s: %w", rutaWindmill, err)
	}

	return valorWindmill, nil
}

// DBConfig contiene la configuración de la base de datos
type DBConfig struct {
	DSN             string
	MaxOpenConns    int
	MaxIdleConns    int
	ConnMaxLifetime time.Duration
}

// DefaultDBConfig retorna la configuración por defecto para Neon
func DefaultDBConfig() DBConfig {
	return DBConfig{
		MaxOpenConns:    5,
		MaxIdleConns:    2,
		ConnMaxLifetime: 5 * time.Minute,
	}
}

// inicializarBaseDatos crea una conexión a PostgreSQL con multiplexor
func InicializarBaseDatos() (*sql.DB, error) {
	return InicializarBaseDatosConConfig(DefaultDBConfig())
}

// InicializarBaseDatosConConfig crea una conexión con configuración personalizada
func InicializarBaseDatosConConfig(config DBConfig) (*sql.DB, error) {
	dsn, err := obtenerSecreto("f/reservas/neon_dsn", "DEV_LOCAL_NEON_DSN")
	if err != nil {
		return nil, err
	}

	db, err := sql.Open("postgres", dsn)
	if err != nil {
		return nil, fmt.Errorf("fallo al instanciar driver postgres: %w", err)
	}

	// Restricciones críticas para nodos efímeros
	db.SetMaxOpenConns(config.MaxOpenConns)
	db.SetMaxIdleConns(config.MaxIdleConns)
	db.SetConnMaxLifetime(config.ConnMaxLifetime)

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := db.PingContext(ctx); err != nil {
		db.Close()
		return nil, fmt.Errorf("rechazo de conexión TCP (Ping fallido): %w", err)
	}

	return db, nil
}
