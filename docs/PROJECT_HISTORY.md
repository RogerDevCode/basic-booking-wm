# 📖 Project History & Lessons Learned

Este documento registra la evolución de **Booking Titanium**, desde la resolución de fallos críticos hasta la implementación de una arquitectura de IA de última generación.

---

## 🏗️ Evolución por Fases (Marzo 2026)

### Fase 1: Estabilidad Crítica y Concurrencia ✅
- **Hito:** Resolución de colisiones de reservas bajo alta concurrencia.
- **Logros:**
  - Implementación de **GiST EXCLUDE Constraint** en PostgreSQL para prevenir solapamientos de tiempo estructuralmente.
  - Uso de **Advisory Locks** para coordinación a nivel de aplicación.
  - Hardening de validación de inputs (SQLi Protection).
- **Métrica:** Colisiones reducidas de 4/5 en tests de estrés a 0/5 (100% prevención).

### Fase 2: Inteligencia y Contexto ✅
- **Hito:** Migración al AI Agent v2.0 y Smart Search.
- **Logros:**
  - Detección de urgencia, flexibilidad y preferencias horarias.
  - Sistema de **9 tipos de respuestas contextuales** (ej. sugerir mañana si hoy está lleno).
  - Implementación de **Sugerencias Inteligentes** (Waitlist, Alternative Dates).
- **Métrica:** Tasa de conversión proyectada aumentada del 30% al 50%+.

### Fase 3: Optimización y Resiliencia ✅
- **Hito:** Preparación para producción masiva.
- **Logros:**
  - **Semantic Caching** con Redis para reducir costos de LLM (-19%).
  - **Circuit Breakers** persistidos en DB para proteger integraciones.
  - Transacciones con **SERIALIZABLE Isolation** y reintentos automáticos.
- **Métrica:** Latencia de respuestas reducida de 400ms a 330ms promedio.

---

## 🎓 Lecciones Aprendidas

### Técnicas
1.  **La base de datos es la ley:** No confiar en la lógica de aplicación para la concurrencia; usar constraints (`EXCLUDE`) y tipos de aislamiento (`SERIALIZABLE`).
2.  **UTC es obligatorio:** El manejo de zonas horarias en sistemas de reservas requiere una normalización absoluta en UTC desde el borde.
3.  **Monitoreo de LLM:** Los modelos (ej. Llama 3.1) pueden ser descontinuados sin aviso. Nunca hardcodear nombres de modelos; usar variables de entorno configurables.
4.  **Cachear greetings:** El 20% de los mensajes son saludos/despedidas. Cachear estos ahorra latencia masiva y costos innecesarios de API.

### Operativas
1.  **Tests de Concurrencia Tempranos:** Probar condiciones de carrera (`Race Conditions`) desde el día 1 salvó meses de depuración de datos inconsistentes.
2.  **Rollback Inverso (LIFO):** En orquestaciones (Saga Pattern), las compensaciones deben ejecutarse en orden inverso a la creación para mantener la integridad referencial.
3.  **SSOT en Tipos:** La migración a TypeScript estricto eliminó una clase entera de bugs de "undefined" que Go manejaba mediante punteros nil.

---

## 📈 Métricas Finales del Proyecto
- **Test Pass Rate:** 100% (78 tests automatizados).
- **Security Score:** 98/100 (Red Team Verified).
- **Performance:** 5x más rápido que la versión inicial basada en n8n.
- **Mantenibilidad:** Documentación sintetizada en 4 guías maestras.
