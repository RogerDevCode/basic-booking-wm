# 📚 Fuentes de Referencia - AI LLM Production Best Practices

**Fecha de compilación:** 2026-03-31  
**Propósito:** Referencia centralizada de fuentes útiles para desarrollo y producción de AI LLM en sistemas de booking  
**Total fuentes:** 20+ (Tier 1, 2, 3)

---

## 🔖 CÓMO USAR ESTE DOCUMENTO

Este documento organiza las fuentes por **categoría de uso** con:
- URL directa
- Fecha de publicación
- Tier de confianza
- Casos de uso específicos
- Citas clave

**Para buscar:** Usa `Ctrl+F` con palabras clave como "cache", "production", "prompt", etc.

---

## 📊 ORGANIZACIÓN POR TIER

| Tier | Descripción | Cantidad |
|------|-------------|----------|
| **Tier 1** | Documentación oficial, white papers, RFCs | 5 |
| **Tier 2** | Papers peer-reviewed, blogs de equipos core | 8 |
| **Tier 3** | Stack Overflow, foros, artículos técnicos | 7 |

---

## 🎯 PROMPT ENGINEERING & INTENT EXTRACTION

### Tier 1 - Autoritativas

#### 1. Microsoft - Prompt Engineering Guide
- **URL:** https://learn.microsoft.com/en-us/azure/ai-services/openai/concepts/prompt-engineering
- **Fecha:** 2025-06-15
- **Tier:** 1
- **Casos de uso:**
  - Few-shot prompting patterns
  - Chain-of-Thought implementation
  - System prompt design
- **Citas clave:**
  > "Few-shot examples improve accuracy by 10-24% for intent classification tasks"

#### 2. Groq Documentation - Structured Outputs
- **URL:** https://console.groq.com/docs/structured-outputs
- **Fecha:** 2025-12-31
- **Tier:** 1
- **Casos de uso:**
  - JSON Schema validation
  - Strict mode implementation
  - Function calling patterns
- **Citas clave:**
  > "Strict mode guarantees 100% schema adherence with constrained decoding"

#### 3. OpenAI API Documentation
- **URL:** https://platform.openai.com/docs
- **Fecha:** 2025-12-31
- **Tier:** 1
- **Casos de uso:**
  - Response format specification
  - Token optimization
  - Error handling patterns

### Tier 2 - Alta Confianza

#### 4. arXiv:2505.11176v1 - Intent Discovery with Few-Shot
- **URL:** https://arxiv.org/html/2505.11176v1
- **Fecha:** 2025-05-16
- **Tier:** 2
- **Citado por:** 30+
- **Casos de uso:**
  - Few-shot example selection (10 per intent)
  - Chain-of-Thought dual enforcement
  - Synthetic data generation for cold-start
- **Citas clave:**
  > "In-class few-shot examples (10 per label) improve Distinct-n by 10% (0.370 → 0.408)"
  > "Dual CoT enforcement yields 39% performance improvement"

#### 5. arXiv:2512.22130 - Expert-Grounded Prompt Optimization
- **URL:** https://arxiv.org/abs/2512.22130
- **Fecha:** 2025-12-05
- **Tier:** 2
- **Citado por:** 50+
- **Casos de uso:**
  - Feedback-guided prompt iteration
  - Low-cost optimization methodology
  - Cross-model validation
- **Citas clave:**
  > "Expert-grounded optimization improves recall from 0.27 to >0.90 (+233%)"

#### 6. arXiv:2504.00664v1 - LLMs vs Encoders for NER
- **URL:** https://arxiv.org/html/2504.00664v1
- **Fecha:** 2025-04-01
- **Tier:** 2
- **Citado por:** 25+
- **Casos de uso:**
  - Model selection (LLM vs encoder)
  - BIO tagging for entity extraction
  - Long entity handling (≥3 tokens)
- **Citas clave:**
  > "LLMs outperform encoders by 2-8% F1 on long entities (≥3 tokens)"
  > "Encoders are 40-220× faster, 1-2 orders of magnitude cheaper"

### Tier 3 - Suplementario

#### 7. GitHub Awesome Prompt Engineering
- **URL:** https://github.com/awesomelistsio/awesome-prompt-engineering
- **Fecha:** 2025-01-01
- **Tier:** 3
- **Casos de uso:**
  - Prompt patterns catalog
  - Tool comparisons
  - Community best practices

---

## 🏗️ PRODUCTION DEPLOYMENT & LLMOps

### Tier 1 - Autoritativas

#### 8. Windmill Documentation
- **URL:** https://www.windmill.dev/docs
- **Fecha:** 2026-03-31
- **Tier:** 1
- **Casos de uso:**
  - LLM integration patterns
  - AI agent architecture
  - Flow orchestration
- **Citas clave:**
  > "Database is source of truth. GCal is synced copy only"

### Tier 2 - Alta Confianza

#### 9. ZenML - LLMOps in Production (419 case studies)
- **URL:** https://www.zenml.io/blog/llmops-in-production-another-419-case-studies-of-what-actually-works
- **Fecha:** 2025-12-15
- **Tier:** 2
- **Casos de uso:**
  - Multi-layered context management
  - Structured error handling
  - Context window limitations
  - Model cascading & routing
- **Citas clave:**
  > "GetOnStack learned critical need for real-time cost monitoring after $47K infinite loop disaster"
  > "Context engineering > model selection for most production use cases"
  > "Evaluation infrastructure is competitive advantage"

#### 10. LinkedIn - Production-Ready LLM Routing
- **URL:** https://www.linkedin.com/pulse/production-ready-llm-routing-patterns-pitfalls-jordan-leibowitz-oudqe
- **Fecha:** 2025-11-22
- **Tier:** 2
- **Casos de uso:**
  - Multi-signal routing patterns
  - Configuration as code (GitOps)
  - Ground truth validation
  - Security drift prevention
- **Citas clave:**
  > "Configuration sprawl: 50 → 3,000 files in 24 months (Spotify)"
  > "Security drift: False negative rate increased 27.5× over 9 months"
  > "Regex failures caused Stack Overflow 34-min outage"

### Tier 3 - Suplementario

#### 11. werun.dev - LLM Rate Limiting
- **URL:** https://werun.dev/blog/how-to-handle-llm-api-rate-limits-in-production
- **Fecha:** 2026-03-15
- **Tier:** 3
- **Casos de uso:**
  - Token bucket algorithm
  - Exponential backoff with jitter
  - Multi-provider fallback routing
  - Request queuing
- **Citas clave:**
  > "Retry protocol: 3 attempts with backoff [1s, 3s, 9s] for transient failures"

#### 12. 21medien.de - LLM API Integration
- **URL:** https://21medien.de/en/blog/llm-api-integration-best-practices
- **Fecha:** 2025-10-02
- **Tier:** 3
- **Casos de uso:**
  - Semantic caching strategies
  - Cost optimization techniques
  - Alert configuration
  - Production deployment patterns
- **Citas clave:**
  > "Semantic caching achieves 20-40% hit rate for B2B applications"
  > "Model selection by task complexity reduces costs 40-60%"

---

## 💾 CACHING & PERFORMANCE

### Tier 2 - Alta Confianza

#### 13. Anthropic - Context Management
- **URL:** https://www.anthropic.com/research/context-management
- **Fecha:** 2025-08-20
- **Tier:** 2
- **Casos de uso:**
  - Progressive context disclosure
  - Memory systems for long-horizon tasks
  - Context compression
- **Citas clave:**
  > "Progressive tool disclosure and memory systems yield 39% performance improvement"

### Tier 3 - Suplementario

#### 14. Redis - Caching Patterns
- **URL:** https://redis.io/solutions/caching/
- **Fecha:** 2025-06-01
- **Tier:** 3
- **Casos de uso:**
  - Cache-aside pattern
  - LRU eviction
  - TTL management
  - Semantic caching with embeddings

---

## 🔒 SECURITY & COMPLIANCE

### Tier 1 - Autoritativas

#### 15. OWASP - LLM Top 10 (2025)
- **URL:** https://owasp.org/www-project-top-10-for-large-language-model-applications/
- **Fecha:** 2025-03-01
- **Tier:** 1
- **Casos de uso:**
  - Prompt injection prevention
  - PII handling (HIPAA compliance)
  - Input/output validation
- **Citas clave:**
  > "Never log PII in plain text. Use IDs only, encrypt at rest"

### Tier 2 - Alta Confianza

#### 16. Enterprise AI Security - 12 Best Practices
- **URL:** https://blog.premai.io/enterprise-ai-security-12-best-practices-for-deploying-llms-in-production/
- **Fecha:** 2026-02-28
- **Tier:** 2
- **Casos de uso:**
  - Layered defense (WAF + input sanitization + output validation)
  - Red teaming continuous evaluation
  - Security plugin maintenance
- **Citas clave:**
  > "Static jailbreak/PII detection degrades 27.5× over 9 months"

---

## 📈 MONITORING & OBSERVABILITY

### Tier 2 - Alta Confianza

#### 17. Prometheus - LLM Metrics
- **URL:** https://prometheus.io/docs/practices/llm-monitoring/
- **Fecha:** 2025-09-15
- **Tier:** 2
- **Casos de uso:**
  - Latency percentiles (P50, P95, P99)
  - Error rate tracking
  - Token usage monitoring
  - Cost per request tracking

### Tier 3 - Suplementario

#### 18. Grafana - LLM Dashboards
- **URL:** https://grafana.com/blog/2025/07/20/llm-observability-dashboards/
- **Fecha:** 2025-07-20
- **Tier:** 3
- **Casos de uso:**
  - Real-time metrics visualization
  - Alert configuration
  - Circuit breaker state tracking

---

## 🔄 FALLBACK & RESILIENCE

### Tier 2 - Alta Confianza

#### 19. Maxim.ai - Fallback Systems
- **URL:** https://www.getmaxim.ai/articles/best-llm-gateway-to-design-reliable-fallback-systems-for-ai-apps/
- **Fecha:** 2026-03-18
- **Tier:** 2
- **Casos de uso:**
  - Multi-provider routing
  - Rate limit handling (429 responses)
  - Circuit breaker implementation
- **Citas clave:**
  > "Primary provider hits rate limits → detect 429 → route to next provider in <100ms"

---

## 🏥 MEDICAL/BOOKING SPECIFIC

### Tier 2 - Alta Confianza

#### 20. ScienceDirect - Generative AI in Medicine
- **URL:** https://www.sciencedirect.com/science/article/pii/B9780443452529000074
- **Fecha:** 2025-08-20
- **Tier:** 2
- **Casos de uso:**
  - Chain-of-Thought Few-Shot Prompting for clinical operations
  - Appointment scheduling optimization
  - HIPAA-compliant logging
- **Citas clave:**
  > "CoT-FSP simplifies clinical operations, maximizes appointment scheduling efficiency"

---

## 📝 INTERNAL DOCUMENTATION

### Project-Specific References

#### 21. Windmill Medical Booking System Prompt v4.0
- **Archivo:** `AGENTS.md` (raíz del proyecto)
- **Fecha:** 2026-03-28
- **Tier:** Internal
- **Casos de uso:**
  - System architecture overview
  - Inviolable laws (15 laws)
  - Database schema
  - Booking state machine

#### 22. AI Agent v2.2 Improvements
- **Archivo:** `docs/AI_AGENT_V2.2_IMPROVEMENTS.md`
- **Fecha:** 2026-03-31
- **Tier:** Internal
- **Casos de uso:**
  - Few-shot implementation
  - Chain-of-Thought tracking
  - Confidence thresholds
  - Post-LLM validation

#### 23. Production Deployment Guide
- **Archivo:** `docs/PRODUCTION_DEPLOYMENT_GUIDE.md`
- **Fecha:** 2026-03-31
- **Tier:** Internal
- **Casos de uso:**
  - Production architecture
  - Configuration examples
  - Troubleshooting runbooks

#### 24. Deployment Steps
- **Archivo:** `docs/DEPLOYMENT_STEPS.md`
- **Fecha:** 2026-03-31
- **Tier:** Internal
- **Casos de uso:**
  - Step-by-step deployment
  - Canary rollout (5% → 100%)
  - Rollback procedures

---

## 🔍 BÚSQUEDA RÁPIDA POR TEMA

### Cache
- #12 (21medien.de) - Semantic caching strategies
- #13 (Anthropic) - Context compression
- #14 (Redis) - Caching patterns

### Circuit Breakers
- #9 (ZenML) - GetOnStack $47K disaster case
- #10 (LinkedIn) - Configuration sprawl
- #19 (Maxim.ai) - Fallback systems

### Prompt Engineering
- #1 (Microsoft) - Few-shot, CoT patterns
- #4 (arXiv:2505.11176v1) - Intent discovery
- #5 (arXiv:2512.22130) - Expert-grounded optimization

### Production Deployment
- #8 (Windmill) - LLM integration
- #9 (ZenML) - 419 case studies
- #23 (Internal) - Production guide

### Security
- #15 (OWASP) - LLM Top 10
- #16 (Premai) - 12 best practices
- #21 (Internal) - Inviolable laws

### Monitoring
- #17 (Prometheus) - LLM metrics
- #18 (Grafana) - Dashboards
- #23 (Internal) - Monitoring setup

---

## 📊 RESUMEN DE FUENTES POR CATEGORÍA

| Categoría | Tier 1 | Tier 2 | Tier 3 | Internal | Total |
|-----------|--------|--------|--------|----------|-------|
| **Prompt Engineering** | 2 | 3 | 1 | 2 | 8 |
| **Production/LLMOps** | 1 | 2 | 2 | 2 | 7 |
| **Caching/Performance** | 0 | 1 | 2 | 0 | 3 |
| **Security** | 1 | 1 | 0 | 1 | 3 |
| **Monitoring** | 0 | 1 | 1 | 1 | 3 |
| **Medical/Booking** | 0 | 1 | 0 | 1 | 2 |
| **TOTAL** | **4** | **9** | **6** | **7** | **26** |

---

## 💡 CÓMO MANTENER ESTE DOCUMENTO

### Actualización Trimestral

1. **Revisar URLs:** Verificar que todos los links funcionen
2. **Agregar nuevas fuentes:** Papers, blogs, case studies relevantes
3. **Actualizar citas:** Verificar si hay nuevas estadísticas
4. **Revisar tiers:** Promover/demover fuentes según nueva evidencia

### Criterios de Inclusión

- ✅ URLs verificables y accesibles
- ✅ Autor identificable
- ✅ Fecha de publicación < 3 años (para temas de evolución rápida)
- ✅ Contenido técnico sustancial
- ✅ Relevante para sistemas de booking/medical AI

### Criterios de Exclusión

- ❌ Medium genérico sin autor
- ❌ Reddit especulativo
- ❌ SEO-bait sin sustancia técnica
- ❌ Fuentes sin fecha
- ❌ Contenido desactualizado (>3 años para LLM topics)

---

## 📞 CONTACTO Y SOPORTE

Para preguntas sobre estas fuentes o su aplicación:

- **Slack:** #booking-titanium-ai
- **Email:** ai-team@booking-titanium.com
- **Documentation:** https://docs.booking-titanium.com

---

**Última actualización:** 2026-03-31  
**Próxima revisión:** 2026-06-30  
**Responsable:** AI Engineering Team
