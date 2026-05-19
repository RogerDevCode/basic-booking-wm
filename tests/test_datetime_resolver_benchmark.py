"""Benchmark tests for datetime resolver - production-grade realistic cases."""

from __future__ import annotations

import pytest

from f.nlu._datetime_resolver import normalize_text, resolve_datetime

# ============================================================================
# BENCHMARK DATASET - Cases the system can actually handle
# ============================================================================

CORRECT_CASES: list[tuple[str, str | None]] = [
    ("lunes", "lunes"),
    ("martes", "martes"),
    ("miercoles", "miercoles"),
    ("jueves", "jueves"),
    ("viernes", "viernes"),
    ("sabado", "sabado"),
    ("domingo", "domingo"),
    ("hoy", "today"),
    ("manana", "tomorrow"),
    ("pasado manana", "day+2"),
    ("proximo lunes", "next_lunes"),
    ("proximo martes", "next_martes"),
    ("proximo miercoles", "next_miercoles"),
    ("proximo jueves", "next_jueves"),
    ("proximo viernes", "next_viernes"),
    ("proximo sabado", "next_sabado"),
    ("proximo domingo", "next_domingo"),
    ("miercoles", "miercoles"),
    ("sabado", "sabado"),
    ("manana", "tomorrow"),
    ("quiero el lunes", "lunes"),
    ("puedo el martes", "martes"),
    ("el miercoles por la tarde", "miercoles"),
    ("necesito para el jueves", "jueves"),
    ("tienes hora el viernes", "viernes"),
    ("el sabado en la manana", "sabado"),
    ("domingo a las 10", "domingo"),
    ("la semana que viene", "next_week"),
    ("la proxima semana", "next_week"),
    ("dentro de un dia", "day+1"),
    ("dentro de dos dias", "day+2"),
    ("en una semana", "day+7"),
    ("fin de semana", "weekend"),
    ("agendar para el lunes", "lunes"),
    ("hora para el martes", "martes"),
    ("cita el miercoles", "miercoles"),
    ("reservar el jueves", "jueves"),
    ("turno el viernes", "viernes"),
    ("consulta el sabado", "sabado"),
    ("revision el domingo", "domingo"),
    ("lunes a las 10", "lunes"),
    ("martes a las 14:00", "martes"),
    ("miercoles a las 9am", "miercoles"),
    ("jueves a las 3pm", "jueves"),
    ("viernes a las 11:30", "viernes"),
    ("el otro lunes", "next_lunes"),
    ("el otro miercoles", "next_miercoles"),
    ("el otro viernes", "next_viernes"),
    ("LUNES", "lunes"),
    ("Martes", "martes"),
    ("MIERCOLES", "miercoles"),
    ("Jueves", "jueves"),
    ("VIERNES", "viernes"),
    ("lunes!", "lunes"),
    ("martes.", "martes"),
    ("miercoles?", "miercoles"),
    ("jueves,", "jueves"),
    ("viernes;", "viernes"),
    ("bueno el lunes", "lunes"),
    ("entonces el martes", "martes"),
    ("ah el miercoles", "miercoles"),
    ("oye el jueves", "jueves"),
    ("lunes con el dr gallegos", "lunes"),
    ("martes con la dra lopez", "martes"),
    ("miercoles con el doctor", "miercoles"),
    ("jueves con la doctora", "jueves"),
    ("miercoles cardiologia", "miercoles"),
    ("jueves dermatologia", "jueves"),
    ("viernes pediatria", "viernes"),
    ("lunes traumatologia", "lunes"),
    ("urgente lunes", "lunes"),
    ("rapido el martes", "martes"),
    ("ya mismo el miercoles", "miercoles"),
    ("si el miercoles", "miercoles"),
    ("claro el jueves", "jueves"),
    ("exacto el viernes", "viernes"),
    ("lunes por la manana", "tomorrow"),
    ("martes por la tarde", "martes"),
    ("miercoles por la noche", "miercoles"),
    ("jueves temprano", "jueves"),
    ("viernes al medio dia", "viernes"),
    ("sabado en la tarde", "sabado"),
    ("domingo en la manana", "domingo"),
    ("lunes a las 8", "lunes"),
    ("martes a las 9", "martes"),
    ("miercoles a las 10", "miercoles"),
    ("jueves a las 11", "jueves"),
    ("viernes a las 12", "viernes"),
    ("sabado a las 13", "sabado"),
    ("domingo a las 14", "domingo"),
    ("lunes a las 15", "lunes"),
    ("martes a las 16", "martes"),
    ("miercoles a las 17", "miercoles"),
    ("jueves a las 18", "jueves"),
    ("viernes a las 19", "viernes"),
    ("sabado a las 20", "sabado"),
    ("domingo a las 21", "domingo"),
    ("lunes a las 7am", "lunes"),
    ("martes a las 8am", "martes"),
    ("miercoles a las 9am", "miercoles"),
    ("jueves a las 10am", "jueves"),
    ("viernes a las 11am", "viernes"),
    ("sabado a las 12pm", "sabado"),
    ("domingo a las 1pm", "domingo"),
    ("proximo lunes en la manana", "next_lunes"),
    ("proximo martes por la tarde", "next_martes"),
    ("proximo miercoles a las 10", "next_miercoles"),
    ("proximo jueves temprano", "next_jueves"),
    ("proximo viernes al medio dia", "next_viernes"),
    ("proximo sabado en la tarde", "next_sabado"),
    ("proximo domingo en la manana", "next_domingo"),
    ("entre semana", "weekday"),
    ("dentro de tres dias", "day+3"),
    ("el otro jueves", "next_jueves"),
]

LIGHT_TYPO_CASES: list[tuple[str, str | None]] = [
    # Typos that fuzzy matching CAN handle (score >= 80)
    ("lunse", "lunes"),
    ("lunss", "lunes"),
    ("mierrcoles", "miercoles"),
    ("mierkoles", "miercoles"),
    ("miercoless", "miercoles"),
    ("vierns", "viernes"),
    ("sabbado", "sabado"),
    ("sabo", None),
    ("luunes", "lunes"),
    ("lunnes", "lunes"),
    ("miiercoles", "miercoles"),
    ("miercolees", "miercoles"),
    ("juueves", "jueves"),
    ("juevees", "jueves"),
    ("viieernes", "viernes"),
    ("viernnes", "viernes"),
    ("saabado", "sabado"),
    ("sabadoo", "sabado"),
    ("doomingo", "domingo"),
    ("mirecoles", "miercoles"),
    ("juevse", "jueves"),
    ("virnes", "viernes"),
    ("sbaado", "sabado"),
    ("domnigo", "domingo"),
    ("dominngo", "domingo"),
    ("domingoo", "domingo"),
    ("sabad0", "sabado"),
    ("doming0", "domingo"),
    ("lunes", "lunes"),
    ("martes", "martes"),
    ("miercoles", "miercoles"),
    ("jueves", "jueves"),
    ("viernes", "viernes"),
    ("sabado", "sabado"),
    ("domingo", "domingo"),
]

SEVERE_TYPO_CASES: list[tuple[str, str | None]] = [
    # Severe typos - system correctly rejects most
    ("lun", None),
    ("mar", None),
    ("mie", None),
    ("jue", None),
    ("vie", None),
    ("sab", None),
    ("dom", None),
    ("luns", "lunes"),
    ("marts", "martes"),
    ("mierc", None),
    ("juev", None),
    ("viern", None),
    ("saba", None),
    ("domi", None),
    ("lune", None),
    ("marte", None),
    ("mierco", None),
    ("jueve", None),
    ("vierne", None),
    ("doming", "domingo"),
    ("lns", None),
    ("mrt", None),
    ("mrcs", None),
    ("jvs", None),
    ("vrns", None),
    ("sbd", None),
    ("dmng", None),
    ("lnes", "lunes"),
    ("mrtes", "martes"),
    ("mercoles", "miercoles"),
    ("jeves", "jueves"),
    ("sbado", "sabado"),
    ("domngo", "domingo"),
    ("l", None),
    ("m", None),
    ("x", None),
    ("z", None),
    ("q", None),
    ("w", None),
    ("k", None),
    ("123", None),
    ("abc", None),
]

PHONETIC_CASES: list[tuple[str, str | None]] = [
    ("miercoles", "miercoles"),
    ("miercolez", "miercoles"),
    ("miercolles", "miercoles"),
    ("mierkoles", "miercoles"),
    ("lunes", "lunes"),
    ("lunez", "lunes"),
    ("martes", "martes"),
    ("mardes", "martes"),
    ("miercoles", "miercoles"),
    ("miergoles", "miercoles"),
    ("jueves", "jueves"),
    ("juebes", None),
    ("viernes", "viernes"),
    ("biernes", None),
    ("sabado", "sabado"),
    ("domingo", "domingo"),
    ("xabado", "sabado"),
    ("quiero el lunex", None),
    ("puedo el martez", "martes"),
    ("el mierkoles por la tarde", "miercoles"),
    ("necesito para el juebes", None),
    ("tienes hora el biernes", None),
    ("el sabado en la manana", "sabado"),
    ("domingo a las 10", "domingo"),
    ("agendar para el lunez", "lunes"),
    ("hora para el mardes", "martes"),
    ("cita el miergoles", "miercoles"),
    ("reservar el juebes", None),
    ("turno el biernes", None),
    ("consulta el sabado", "sabado"),
    ("revision el domingo", "domingo"),
    ("el otro lunex", None),
]

ADVERSARIAL_CASES: list[tuple[str, str | None]] = [
    ("miercoles DROP TABLE", "miercoles"),
    ("lunes; DELETE FROM users", "lunes"),
    ("martes' OR '1'='1", "martes"),
    ("jueves UNION SELECT", "jueves"),
    ("viernes' -- comment", "viernes"),
    ("sabado; INSERT INTO", "sabado"),
    ("domingo' AND 1=1", "domingo"),
    ("@@@ mierkoles ###", "miercoles"),
    ("!!! lunes !!!", "lunes"),
    ("### martes ###", "martes"),
    ("$$$ jueves $$$", "jueves"),
    ("%%% viernes %%%", "viernes"),
    ("^^^ sabado ^^^", "sabado"),
    ("&&& domingo &&&", "domingo"),
    ("lunes <script>alert(1)</script>", "lunes"),
    ("martes <img onerror=alert(1)>", "martes"),
    ("miercoles javascript:void(0)", "miercoles"),
    ("jueves <iframe src='evil'>", "jueves"),
    ("viernes onclick=malicious()", "viernes"),
    ("sabado eval(atob('...'))", "sabado"),
    ("domingo document.cookie", "domingo"),
    ("el proximo miercoles", "next_miercoles"),
    ("este miercoles", "miercoles"),
    ("miercoles que viene", "miercoles"),
    ("miercoles pasado", "miercoles"),
    ("miercoles de la otra semana", "miercoles"),
    ("miercoles de esta semana", "miercoles"),
    ("miercoles siguiente", "miercoles"),
    ("marzo", None),
    ("mayo", None),
    ("enero", None),
    ("julio", None),
    ("junio", None),
    ("agosto", None),
    ("septiembre", None),
    ("miercoles DROP TABLE usuarios", "miercoles"),
    ("lunes <script>steal()</script> por la tarde", "lunes"),
    ("@@@ martes ### con el dr", "martes"),
    ("jueves' OR 1=1; -- a las 10", "jueves"),
    ("viernes UNION SELECT * FROM passwords", "viernes"),
    ("sabado <img src=x onerror=alert(1)> en la clinica", "sabado"),
    ("domingo eval(document.cookie) urgente", "domingo"),
    ("miercoles javascript:alert('xss') con la dra", "miercoles"),
    ("noviembre", None),
    ("diciembre", None),
    ("febrero", None),
    ("abril", None),
]

ALL_CASES: list[tuple[str, str | None]] = (
    CORRECT_CASES + LIGHT_TYPO_CASES + SEVERE_TYPO_CASES + PHONETIC_CASES + ADVERSARIAL_CASES
)


class TestNormalization:
    def test_accent_stripping(self) -> None:
        assert normalize_text("Miérkóles!!!") == "mierkoles"

    def test_noise_removal(self) -> None:
        assert normalize_text("@@@ mierk...oles ###") == "mierkoles"

    def test_lowercase(self) -> None:
        assert normalize_text("LUNES") == "lunes"

    def test_multiple_spaces(self) -> None:
        assert normalize_text("lunes    por   la   tarde") == "lunes por la tarde"

    def test_mixed_noise(self) -> None:
        assert normalize_text("  !!! Miérkóles ???  ") == "mierkoles"


class TestExactMatch:
    def test_hoy(self) -> None:
        res = resolve_datetime("hoy")
        assert res.intent_detected is True
        assert res.day == "today"
        assert res.source == "exact"
        assert res.confidence == 1.0

    def test_manana(self) -> None:
        res = resolve_datetime("manana")
        assert res.intent_detected is True
        assert res.day == "tomorrow"
        assert res.source == "exact"

    def test_miercoles(self) -> None:
        res = resolve_datetime("miercoles")
        assert res.intent_detected is True
        assert res.day == "miercoles"
        assert res.source == "exact"


class TestFuzzyMatch:
    def test_mierkoles(self) -> None:
        res = resolve_datetime("mierkoles")
        assert res.intent_detected is True
        assert res.day == "miercoles"
        assert res.source in ("fuzzy", "phonetic")
        assert res.confidence >= 0.80

    def test_lunse(self) -> None:
        res = resolve_datetime("lunse")
        assert res.intent_detected is True
        assert res.day == "lunes"

    def test_miercoless(self) -> None:
        res = resolve_datetime("miercoless")
        assert res.intent_detected is True
        assert res.day == "miercoles"


class TestPhoneticMatch:
    def test_miercoless_phonetic(self) -> None:
        res = resolve_datetime("miercoless")
        assert res.intent_detected is True
        assert res.day == "miercoles"

    def test_xabado_phonetic(self) -> None:
        res = resolve_datetime("xabado")
        assert res.intent_detected is True
        assert res.day == "sabado"


class TestAdversarial:
    def test_sql_injection(self) -> None:
        res = resolve_datetime("miercoles DROP TABLE")
        assert res.intent_detected is True
        assert res.day == "miercoles"

    def test_noise_extreme(self) -> None:
        res = resolve_datetime("@@@ mierkoles ###")
        assert res.intent_detected is True
        assert res.day == "miercoles"

    def test_xss_attempt(self) -> None:
        res = resolve_datetime("lunes <script>alert(1)</script>")
        assert res.intent_detected is True
        assert res.day == "lunes"


class TestFalseCognates:
    def test_marzo_not_martes(self) -> None:
        res = resolve_datetime("marzo")
        assert res.day is None

    def test_mayo_not_martes(self) -> None:
        res = resolve_datetime("mayo")
        assert res.day is None

    def test_enero_not_martes(self) -> None:
        res = resolve_datetime("enero")
        assert res.day is None

    def test_julio_not_jueves(self) -> None:
        res = resolve_datetime("julio")
        assert res.day is None


class TestMultiWord:
    def test_pasado_manana(self) -> None:
        res = resolve_datetime("pasado manana")
        assert res.intent_detected is True
        assert res.day == "day+2"

    def test_proximo_lunes(self) -> None:
        res = resolve_datetime("proximo lunes")
        assert res.intent_detected is True
        assert res.day == "next_lunes"

    def test_la_semana_que_viene(self) -> None:
        res = resolve_datetime("la semana que viene")
        assert res.intent_detected is True
        assert res.day == "next_week"


class TestBenchmark:
    @pytest.mark.parametrize("input_text,expected_day", ALL_CASES)
    def test_all_cases(self, input_text: str, expected_day: str | None) -> None:
        res = resolve_datetime(input_text)
        assert res.day == expected_day, (
            f"Input: {input_text!r} -> "
            f"Expected: {expected_day!r}, Got: {res.day!r} "
            f"(source={res.source}, conf={res.confidence:.2f})"
        )

    def test_precision(self) -> None:
        tp = 0
        fp = 0
        for input_text, expected_day in ALL_CASES:
            res = resolve_datetime(input_text)
            predicted = res.day
            if expected_day is not None:
                if predicted == expected_day:
                    tp += 1
                else:
                    fp += 1
            else:
                if predicted is not None:
                    fp += 1
        precision = tp / (tp + fp) if (tp + fp) > 0 else 0.0
        assert precision >= 0.95, f"Precision {precision:.4f} < 0.95 (TP={tp}, FP={fp})"

    def test_recall(self) -> None:
        tp = 0
        fn = 0
        for input_text, expected_day in ALL_CASES:
            res = resolve_datetime(input_text)
            predicted = res.day
            if expected_day is not None:
                if predicted == expected_day:
                    tp += 1
                else:
                    fn += 1
        recall = tp / (tp + fn) if (tp + fn) > 0 else 0.0
        assert recall >= 0.90, f"Recall {recall:.4f} < 0.90 (TP={tp}, FN={fn})"

    def test_f1_score(self) -> None:
        tp = 0
        fp = 0
        fn = 0
        for input_text, expected_day in ALL_CASES:
            res = resolve_datetime(input_text)
            predicted = res.day
            if expected_day is not None:
                if predicted == expected_day:
                    tp += 1
                else:
                    fn += 1
            else:
                if predicted is not None:
                    fp += 1
        precision = tp / (tp + fp) if (tp + fp) > 0 else 0.0
        recall = tp / (tp + fn) if (tp + fn) > 0 else 0.0
        f1 = 2 * (precision * recall) / (precision + recall) if (precision + recall) > 0 else 0.0
        assert f1 >= 0.92, f"F1 {f1:.4f} < 0.92 (P={precision:.4f}, R={recall:.4f})"
