package providers

import (
	"database/sql"
	"fmt"

	"booking-titanium-wm/internal/core/db"
	"booking-titanium-wm/pkg/types"
	"booking-titanium-wm/pkg/utils"
)

// ServiceQueries maneja las queries de services
type ServiceQueries struct{}

// NewServiceQueries crea una nueva instancia de ServiceQueries
func NewServiceQueries() *ServiceQueries {
	return &ServiceQueries{}
}

// GetAll obtiene todos los servicios activos
func (q *ServiceQueries) GetAll() ([]types.Service, error) {
	query := `
		SELECT id, name, duration_min, buffer_min, min_lead_booking_hours, min_lead_cancel_hours, price, currency
		FROM services
		ORDER BY name`

	rows, err := db.GetDB().Query(query)
	if err != nil {
		return nil, fmt.Errorf("failed to get services: %w", err)
	}
	defer rows.Close()

	var services []types.Service
	for rows.Next() {
		var service types.Service

		err := rows.Scan(
			&service.ID,
			&service.Name,
			&service.DurationMinutes,
			&service.BufferMinutes,
			&service.MinLeadBookingHours,
			&service.MinLeadCancelHours,
			&service.Price,
			&service.Currency,
		)
		if err != nil {
			return nil, fmt.Errorf("failed to scan service: %w", err)
		}

		services = append(services, service)
	}

	return services, nil
}

// GetByID obtiene un servicio por ID
func (q *ServiceQueries) GetByID(serviceID int) (*types.Service, error) {
	query := `
		SELECT id, name, duration_min, buffer_min, min_lead_booking_hours, min_lead_cancel_hours, price, currency
		FROM services
		WHERE id = $1
		LIMIT 1`

	row := db.GetDB().QueryRow(query, serviceID)

	var service types.Service

	err := row.Scan(
		&service.ID,
		&service.Name,
		&service.DurationMinutes,
		&service.BufferMinutes,
		&service.MinLeadBookingHours,
		&service.MinLeadCancelHours,
		&service.Price,
		&service.Currency,
	)

	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get service: %w", err)
	}

	return &service, nil
}

// GetByProviderID obtiene servicios por provider_id
func (q *ServiceQueries) GetByProviderID(providerID int) ([]types.Service, error) {
	query := `
		SELECT DISTINCT s.id, s.name, s.duration_min, s.buffer_min, s.min_lead_booking_hours, s.min_lead_cancel_hours, s.price, s.currency
		FROM services s
		INNER JOIN provider_services ps ON s.id = ps.service_id
		WHERE ps.provider_id = $1
		ORDER BY s.name`

	rows, err := db.GetDB().Query(query, providerID)
	if err != nil {
		return nil, fmt.Errorf("failed to get services by provider: %w", err)
	}
	defer rows.Close()

	var services []types.Service
	for rows.Next() {
		var service types.Service

		err := rows.Scan(
			&service.ID,
			&service.Name,
			&service.DurationMinutes,
			&service.BufferMinutes,
			&service.MinLeadBookingHours,
			&service.MinLeadCancelHours,
			&service.Price,
			&service.Currency,
		)
		if err != nil {
			return nil, fmt.Errorf("failed to scan service: %w", err)
		}

		services = append(services, service)
	}

	return services, nil
}

// GetServices obtiene todos los servicios activos
func GetServices() types.StandardContractResponse[map[string]any] {
	source := "DB_Get_Services"
	workflowID := "db-get-services-v1"
	version := "1.0.0"

	queries := NewServiceQueries()
	services, err := queries.GetAll()
	if err != nil {
		return utils.ErrorResponse[map[string]any](
			types.ErrorCodeDBError,
			fmt.Sprintf("Failed to get services: %v", err),
			source,
			workflowID,
			version,
		)
	}

	// Handle empty result
	if services == nil {
		services = []types.Service{}
	}

	data := map[string]any{
		"services": services,
		"total":    len(services),
	}

	return utils.SuccessResponse(data, source, workflowID, version)
}

// GetServicesByProvider obtiene servicios por provider_id
func GetServicesByProvider(providerID int) types.StandardContractResponse[map[string]any] {
	source := "DB_Get_Services"
	workflowID := "db-get-services-by-provider-v1"
	version := "1.0.0"

	// Validate provider_id
	validation := utils.ValidatePositiveInt(providerID, "provider_id")
	if !validation.Valid {
		return utils.ErrorResponse[map[string]any](
			validation.Error,
			validation.Message,
			source,
			workflowID,
			version,
		)
	}

	queries := NewServiceQueries()
	services, err := queries.GetByProviderID(providerID)
	if err != nil {
		return utils.ErrorResponse[map[string]any](
			types.ErrorCodeDBError,
			fmt.Sprintf("Failed to get services by provider: %v", err),
			source,
			workflowID,
			version,
		)
	}

	// Handle empty result
	if services == nil {
		services = []types.Service{}
	}

	data := map[string]any{
		"services":    services,
		"total":       len(services),
		"provider_id": providerID,
	}

	return utils.SuccessResponse(data, source, workflowID, version)
}
