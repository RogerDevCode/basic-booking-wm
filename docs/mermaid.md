```mermaid
erDiagram
    %% ==========================================
    %% EER: SUPERTIPO PERSONA (Solapamiento - o)
    %% ==========================================
    PERSONA {
        string RUT PK
        string Nombre
        date Fecha_Nacimiento
        string Telefono
        string Direccion_Completa
    }
    CLIENTE {
        string RUT PK_FK "Identificador heredado"
        string Nivel_Experiencia
    }
    STAFF {
        string RUT PK_FK "Identificador heredado"
        string Cargo
    }
    %% Notación ISA simulada para Solapamiento (o)
    PERSONA ||--o| CLIENTE : "ISA (o)"
    PERSONA ||--o| STAFF : "ISA (o)"

    %% ==========================================
    %% EER: SUPERTIPO IMPLEMENTO (Disjunta - d)
    %% ==========================================
    IMPLEMENTO {
        int id_Implemento PK
        int id_Categoria FK
        float Tarifa_Diaria
        string Marca
    }
    VESTUARIO {
        int id_Implemento PK_FK
        string Talla
        string Nivel_Termico
    }
    EQUIPO_TECNICO {
        int id_Implemento PK_FK
        float Peso_Kg
        date Fecha_Ultimo_Mantenimiento
    }
    %% Notación ISA simulada para Disyunción (d)
    IMPLEMENTO ||--|| VESTUARIO : "ISA (d)"
    IMPLEMENTO ||--|| EQUIPO_TECNICO : "ISA (d)"

    %% ==========================================
    %% MER CLÁSICO: NÚCLEO TRANSACCIONAL
    %% ==========================================
    ARRIENDO {
        int id_Arriendo PK
        string RUT_Cliente FK
        date Fecha_Arriendo
    }
    DETALLE_ARRIENDO {
        int id_Arriendo PK_FK
        int id_Implemento PK_FK
        float Descuento_Aplicado
        date Fecha_Devolucion_Pactada
    }
    DEVOLUCION {
        int id_Devolucion PK
        int id_Arriendo FK
        date Fecha_Real_Recepcion
        string Estado_General
    }
    PAGO {
        int id_Pago PK
        int id_Arriendo FK
        float Monto_Abonado
    }
    MULTA {
        int id_Multa PK
        int id_Devolucion FK
        float Monto_Multa
    }
    CATEGORIA {
        int id_Categoria PK
        string Nombre_Categoria
    }

    %% Relaciones
    CLIENTE ||--o{ ARRIENDO : "Realiza"
    ARRIENDO ||--|{ DETALLE_ARRIENDO : "Contiene"
    IMPLEMENTO ||--o{ DETALLE_ARRIENDO : "Es_Asignado"
    CATEGORIA ||--|{ IMPLEMENTO : "Agrupa"
    ARRIENDO ||--o| DEVOLUCION : "Genera"
    ARRIENDO ||--o{ PAGO : "Registra"
    DEVOLUCION ||--o{ MULTA : "Puede_Generar"
```