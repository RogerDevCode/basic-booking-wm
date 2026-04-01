# DEEPSEARCH — Búsqueda Técnica Profunda en 3 Tiers

## Descripción
Herramienta CLI que ejecuta búsquedas técnicas estructuradas en 3 niveles de autoridad:
- **Tier 1 (Oficial):** GitHub repos por estrellas
- **Tier 2 (Académico):** Semantic Scholar papers por citas
- **Tier 3 (Comunidad):** Stack Overflow por votos

## Uso
```bash
deepsearch --topic "<query>" [--citations <int>] [--score <int>]
```

### Ejemplos
```bash
deepsearch --topic "TypeScript AI agent best practices"
deepsearch --topic "LLM intent classification" --citations 20
deepsearch --topic "Windmill workflow patterns" --score 10
```

## Instalación
```bash
chmod +x .claude/skills/deepsearch/deepsearch
mkdir -p ~/.local/bin
ln -sf "$(pwd)/.claude/skills/deepsearch/deepsearch" ~/.local/bin/deepsearch
```

## Verificación
```bash
deepsearch --topic "Golang MQTT"
```

## Para Agentes AI
Cuando necesites investigar un tema técnico, validar best practices o encontrar fuentes autorizadas, EJECUTA:
```bash
deepsearch --topic "<tu tema>"
```
El output es JSON estricto por stdout. Parsea el JSON y usa las URLs y métricas para formular tu respuesta.
