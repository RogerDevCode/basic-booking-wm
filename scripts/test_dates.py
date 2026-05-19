from f.message_preprocessor.main import _preprocess


def test_dates():
    phrases = [
        # Caóticos / Typos Extremos (Fonéticos y dedo gordo)
        "el miércolesssss",
        "puedo el juves",
        "tienen hora para el savado",
        "el procszimo lune",
        # Paranoicos / Inyecciones / Casos límite (Adversarial)
        "el martes DROP TABLE bookings;",
        "el viernes <script>alert(1)</script>",
        "hoy \n \t   mañana",
        "null",
        # Controversiales / Confusos / Falsos cognados
        "en marzo",  # Falso cognado fonético de martes
        "el mes de mayo",  # Falso cognado de mañana/martes
        "ayer",  # Tiempo pasado (no sirve para agendar)
        "el día del juicio final",  # Basura semántica
        # Abreviaciones extremas / Modismos móviles
        "tienen horita pal prox mierkoles",
        "pa mñn",
        "xd el domingooo",
    ]

    print("=" * 70)
    print("🧪 PRUEBAS CAÓTICAS, PARANOICAS Y CONTROVERSIALES (RED TEAM)")
    print("=" * 70)

    for p in phrases:
        res = _preprocess(p)
        print(f"\n☢️ RAW: '{p}'")
        print(f"🧹 CLEANED: '{res.cleaned_text}'")

        if res.sql_threat_detected:
            print("🛡️ [FAIL-FAST] INYECCIÓN SQL DETECTADA Y CENSURADA.")

        dt_res = res.datetime_resolution
        if dt_res:
            print(f"⏱️ INTENT DETECTED: {dt_res.intent_detected}")
            if dt_res.day:
                print(f"🎯 DAY MATCH: {dt_res.day} (Source: {dt_res.source})")
            if dt_res.datetime_iso:
                print(f"📅 DATETIME ISO: {dt_res.datetime_iso}")
            print(f"📊 CONFIDENCE: {dt_res.confidence:.2f}")
            if dt_res.errors:
                print(f"⚠️ ERRORS: {dt_res.errors}")
        else:
            print("❌ NO DATETIME RESOLUTION")


if __name__ == "__main__":
    test_dates()
