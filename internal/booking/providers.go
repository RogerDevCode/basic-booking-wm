package booking

import (
	"database/sql"
	"fmt"
	"strings"

	"booking-titanium-wm/internal/core/db"
	"booking-titanium-wm/pkg/logging"
	"booking-titanium-wm/pkg/types"
	"booking-titanium-wm/pkg/utils"
)

var log = logging.GetDefaultLogger()

// Provider representa un proveedor de la base de datos
type Provider struct {
	ID        int     `json:"id"`
	Name      string  `json:"name"`
	Email     string  `json:"email"`
	IsActive  bool    `json:"active"`
	GCalID    *string `json:"gcal_calendar_id,omitempty"`
}

// GetProviders retorna la lista de proveedores con filtros opcionales
func GetProviders(activeFilter interface{}) types.StandardContractResponse[map[string]any] {
	source := "DB_Get_Providers"
	workflowID := "db-get-providers-v1"
	version := "1.0.0"

	query := "SELECT id, name, email, is_active, gcal_calendar_id FROM providers"
	var args []interface{}

	// Handle active filter (can be bool, string "true"/"false", "1"/"0")
	if activeFilter != nil {
		var active bool
		var valid bool

		switch v := activeFilter.(type) {
		case bool:
			active = v
			valid = true
		case string:
			switch strings.ToLower(v) {
			case "true", "1":
				active = true
				valid = true
			case "false", "0":
				active = false
				valid = true
			}
		}

		if valid {
			query += " WHERE is_active = $1"
			args = append(args, active)
		} else {
			return utils.ErrorResponse[map[string]any](
				types.ErrorCodeInvalidInput,
				"Invalid active filter value",
				source,
				workflowID,
				version,
			)
		}
	}

	query += " ORDER BY id ASC"

	rows, err := db.GetDB().Query(query, args...)
	if err != nil {
		log.Error("GetProviders query failed: %v", err)
		return utils.ErrorResponse[map[string]any](
			types.ErrorCodeDBError,
			fmt.Sprintf("Failed to query providers: %v", err),
			source,
			workflowID,
			version,
		)
	}
	defer rows.Close()

	var providers []Provider
	for rows.Next() {
		var p Provider
		var gcalID sql.NullString
		err := rows.Scan(&p.ID, &p.Name, &p.Email, &p.IsActive, &gcalID)
		if err != nil {
			log.Error("GetProviders scan failed: %v", err)
			return utils.ErrorResponse[map[string]any](
				types.ErrorCodeDBError,
				fmt.Sprintf("Failed to scan provider: %v", err),
				source,
				workflowID,
				version,
			)
		}
		if gcalID.Valid {
			p.GCalID = &gcalID.String
		}
		providers = append(providers, p)
	}

	data := map[string]any{
		"providers": providers,
		"total":     len(providers),
	}

	return utils.SuccessResponse(data, source, workflowID, version)
}
