from __future__ import annotations

import logging
from typing import Any
from unittest.mock import AsyncMock, patch

import pytest

from f.telegram_gateway.worker import cron_auto_cancel_expired, cron_gcal_reconcile


@pytest.mark.asyncio
async def test_cron_auto_cancel_expired_happy_path_success() -> None:
    """
    NAME             | test_cron_auto_cancel_expired_happy_path_success
    ORIGIN           | Requirements for running auto-cancel tasks on cron interval.
    PREMISE          | Underlying function run_auto_cancel_expired runs successfully.
    ACTION           | cron_auto_cancel_expired is invoked by the scheduler.
    GUARANTEE        | It executes run_auto_cancel_expired and logs completion.
    FAILURE REVEALED | Failure to trigger the cancellation pipeline or format log statements correctly.
    """
    # Arrange
    ctx: dict[str, Any] = {}
    mock_run = AsyncMock(return_value={"cancelled_count": 5})

    with patch("f.telegram_gateway.worker.run_auto_cancel_expired", mock_run):
        # Action
        await cron_auto_cancel_expired(ctx)

        # Assert
        mock_run.assert_called_once()


@pytest.mark.asyncio
async def test_cron_auto_cancel_expired_chaos_malformed_return() -> None:
    """
    NAME             | test_cron_auto_cancel_expired_chaos_malformed_return
    ORIGIN           | Fault tolerance requirements (Fail-fast / Robust logging).
    PREMISE          | Underlying function returns malformed result (empty dict or None).
    ACTION           | cron_auto_cancel_expired is invoked.
    GUARANTEE        | It handles the missing keys gracefully without raising exceptions to arq (handled internally).
    FAILURE REVEALED | Crash inside the cron handler when logging or processing the output structure.
    """
    # Arrange
    ctx: dict[str, Any] = {}

    # 1. Test returning empty dict
    mock_run_empty = AsyncMock(return_value={})
    with (
        patch("f.telegram_gateway.worker.run_auto_cancel_expired", mock_run_empty),
        patch("f.telegram_gateway.worker.log_structured") as mock_log,
    ):
        await cron_auto_cancel_expired(ctx)
        mock_run_empty.assert_called_once()
        # Verify log_structured was called with logging.INFO
        mock_log.assert_any_call(
            logging.INFO,
            "cron_auto_cancel_expired_completed",
            cancelled_count=0,
        )

    # 2. Test returning None (which would raise AttributeError if calling .get)
    mock_run_none = AsyncMock(return_value=None)
    with (
        patch("f.telegram_gateway.worker.run_auto_cancel_expired", mock_run_none),
        patch("f.telegram_gateway.worker.log_structured") as mock_log,
    ):
        await cron_auto_cancel_expired(ctx)
        # Should catch AttributeError and log as logging.ERROR
        from unittest.mock import ANY

        mock_log.assert_any_call(
            logging.ERROR,
            "cron_auto_cancel_expired_failed",
            error=ANY,
        )


@pytest.mark.asyncio
async def test_cron_auto_cancel_expired_paranoid_db_failure() -> None:
    """
    NAME             | test_cron_auto_cancel_expired_paranoid_db_failure
    ORIGIN           | Robust exception bubbling & worker protection.
    PREMISE          | The database client raises a connection pool timeout or database exception.
    ACTION           | cron_auto_cancel_expired is called.
    GUARANTEE        | It catches the exception, logs it at logging.ERROR, and doesn't crash the worker lifecycle.
    FAILURE REVEALED | Unhandled exception escaping cron function which could kill the worker loop.
    """
    # Arrange
    ctx: dict[str, Any] = {}
    mock_run = AsyncMock(side_effect=ConnectionRefusedError("DB connection dead"))

    with (
        patch("f.telegram_gateway.worker.run_auto_cancel_expired", mock_run),
        patch("f.telegram_gateway.worker.log_structured") as mock_log,
    ):
        # Action
        await cron_auto_cancel_expired(ctx)

        # Assert
        mock_log.assert_any_call(
            logging.ERROR,
            "cron_auto_cancel_expired_failed",
            error="DB connection dead",
        )


@pytest.mark.asyncio
async def test_cron_gcal_reconcile_happy_path_success() -> None:
    """
    NAME             | test_cron_gcal_reconcile_happy_path_success
    ORIGIN           | Requirements for running GCal reconciliation cron.
    PREMISE          | Reconciliation executes successfully.
    ACTION           | cron_gcal_reconcile is invoked.
    GUARANTEE        | Executes run_gcal_reconcile and logs correctly.
    FAILURE REVEALED | Failure to trigger GCal reconcile pipeline or log parameters correctly.
    """
    # Arrange
    ctx: dict[str, Any] = {}
    mock_run = AsyncMock(return_value={"processed": 10, "synced": 8, "failed": 2})

    with patch("f.telegram_gateway.worker.run_gcal_reconcile", mock_run):
        # Action
        await cron_gcal_reconcile(ctx)

        # Assert
        mock_run.assert_called_once_with({})


@pytest.mark.asyncio
async def test_cron_gcal_reconcile_chaos_malformed_return() -> None:
    """
    NAME             | test_cron_gcal_reconcile_chaos_malformed_return
    ORIGIN           | Robustness in case of malformed service returns.
    PREMISE          | run_gcal_reconcile returns an empty dict.
    ACTION           | cron_gcal_reconcile is executed.
    GUARANTEE        | Fallbacks to default values (0) are used, logging successfully.
    FAILURE REVEALED | KeyError when logging missing results.
    """
    # Arrange
    ctx: dict[str, Any] = {}
    mock_run = AsyncMock(return_value={})

    with (
        patch("f.telegram_gateway.worker.run_gcal_reconcile", mock_run),
        patch("f.telegram_gateway.worker.log_structured") as mock_log,
    ):
        # Action
        await cron_gcal_reconcile(ctx)

        # Assert
        mock_log.assert_any_call(
            logging.INFO,
            "cron_gcal_reconcile_completed",
            processed=0,
            synced=0,
            failed=0,
        )


@pytest.mark.asyncio
async def test_cron_gcal_reconcile_paranoid_gcal_api_crash() -> None:
    """
    NAME             | test_cron_gcal_reconcile_paranoid_gcal_api_crash
    ORIGIN           | API outage robustness.
    PREMISE          | Google API client crashes with RuntimeError.
    ACTION           | cron_gcal_reconcile is called.
    GUARANTEE        | Error is captured, logged as logging.ERROR, worker survives.
    FAILURE REVEALED | Unhandled RuntimeError propagation causing worker thread termination.
    """
    # Arrange
    ctx: dict[str, Any] = {}
    mock_run = AsyncMock(side_effect=RuntimeError("GCal API Rate limit exceeded"))

    with (
        patch("f.telegram_gateway.worker.run_gcal_reconcile", mock_run),
        patch("f.telegram_gateway.worker.log_structured") as mock_log,
    ):
        # Action
        await cron_gcal_reconcile(ctx)

        # Assert
        mock_log.assert_any_call(
            logging.ERROR,
            "cron_gcal_reconcile_failed",
            error="GCal API Rate limit exceeded",
        )
