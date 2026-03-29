package providers

import (
	"database/sql"
	"fmt"

	"booking-titanium-wm/internal/core/db"
	"booking-titanium-wm/pkg/types"
	"booking-titanium-wm/pkg/utils"
)

// ProviderQueries maneja las queries de providers
type ProviderQueries struct{}

// NewProviderQueries crea una nueva instancia de ProviderQueries
func NewProviderQueries() *ProviderQueries {
	return &ProviderQueries{}
}

// GetAll obtiene todos los proveedores activos
func (q *ProviderQueries) GetAll() ([]types.Provider, error) {
	query := `
		SELECT id, name, email, is_active, gcal_calendar_id
		FROM providers
		WHERE is_active = true
		ORDER BY name`

	rows, err := db.GetDB().Query(query)
	if err != nil {
		return nil, fmt.Errorf("failed to get providers: %w", err)
	}
	defer rows.Close()

	var providers []types.Provider
	for rows.Next() {
		var provider types.Provider
		var gcalCalendarID sql.NullString

		err := rows.Scan(
			&provider.ID,
			&provider.Name,
			&provider.Email,
			&provider.IsActive,
			&gcalCalendarID,
		)
		if err != nil {
			return nil, fmt.Errorf("failed to scan provider: %w", err)
		}

		if gcalCalendarID.Valid {
			provider.GCalCalendarID = &gcalCalendarID.String
		}

		providers = append(providers, provider)
	}

	return providers, nil
}

// GetByID obtiene un proveedor por ID
func (q *ProviderQueries) GetByID(providerID int) (*types.Provider, error) {
	query := `
		SELECT id, name, email, is_active, gcal_calendar_id
		FROM providers
		WHERE id = $1 AND is_active = true
		LIMIT 1`

	row := db.GetDB().QueryRow(query, providerID)

	var provider types.Provider
	var gcalCalendarID sql.NullString

	err := row.Scan(
		&provider.ID,
		&provider.Name,
		&provider.Email,
		&provider.IsActive,
		&gcalCalendarID,
	)

	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get provider: %w", err)
	}

	if gcalCalendarID.Valid {
		provider.GCalCalendarID = &gcalCalendarID.String
	}

	return &provider, nil
}

// GetByServiceID obtiene proveedores por service_id
func (q *ProviderQueries) GetByServiceID(serviceID int) ([]types.Provider, error) {
	query := `
		SELECT DISTINCT p.id, p.name, p.email, p.is_active, p.gcal_calendar_id
		FROM providers p
		INNER JOIN provider_services ps ON p.id = ps.provider_id
		WHERE ps.service_id = $1 AND p.is_active = true
		ORDER BY p.name`

	rows, err := db.GetDB().Query(query, serviceID)
	if err != nil {
		return nil, fmt.Errorf("failed to get providers by service: %w", err)
	}
	defer rows.Close()

	var providers []types.Provider
	for rows.Next() {
		var provider types.Provider
		var gcalCalendarID sql.NullString

		err := rows.Scan(
			&provider.ID,
			&provider.Name,
			&provider.Email,
			&provider.IsActive,
			&gcalCalendarID,
		)
		if err != nil {
			return nil, fmt.Errorf("failed to scan provider: %w", err)
		}

		if gcalCalendarID.Valid {
			provider.GCalCalendarID = &gcalCalendarID.String
		}

		providers = append(providers, provider)
	}

	return providers, nil
}

// GetProviders obtiene todos los proveedores activos
func GetProviders() types.StandardContractResponse[map[string]any] {
	source := "DB_Get_Providers"
	workflowID := "db-get-providers-v1"
	version := "1.0.0"

	queries := NewProviderQueries()
	providers, err := queries.GetAll()
	if err != nil {
		return utils.ErrorResponse[map[string]any](
			types.ErrorCodeDBError,
			fmt.Sprintf("Failed to get providers: %v", err),
			source,
			workflowID,
			version,
		)
	}

	// Handle empty result
	if providers == nil {
		providers = []types.Provider{}
	}

	data := map[string]any{
		"providers": providers,
		"total":     len(providers),
	}

	return utils.SuccessResponse(data, source, workflowID, version)
}

// GetProvidersByService obtiene proveedores por service_id
func GetProvidersByService(serviceID int) types.StandardContractResponse[map[string]any] {
	source := "DB_Get_Providers_By_Service"
	workflowID := "db-get-providers-by-service-v1"
	version := "1.0.0"

	// Validate service_id
	validation := utils.ValidatePositiveInt(serviceID, "service_id")
	if !validation.Valid {
		return utils.ErrorResponse[map[string]any](
			validation.Error,
			validation.Message,
			source,
			workflowID,
			version,
		)
	}

	queries := NewProviderQueries()
	providers, err := queries.GetByServiceID(serviceID)
	if err != nil {
		return utils.ErrorResponse[map[string]any](
			types.ErrorCodeDBError,
			fmt.Sprintf("Failed to get providers by service: %v", err),
			source,
			workflowID,
			version,
		)
	}

	// Handle empty result
	if providers == nil {
		providers = []types.Provider{}
	}

	data := map[string]any{
		"providers":  providers,
		"total":      len(providers),
		"service_id": serviceID,
	}

	return utils.SuccessResponse(data, source, workflowID, version)
}
