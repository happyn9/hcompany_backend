"""Exécution parallèle de tests de concurrence : barrière ET délais maximaux, erreurs de threads capturées.

Un thread qui plante ne doit jamais disparaître silencieusement (résultat manquant pris pour un succès), et un
thread bloqué ne doit pas figer toute la suite : tout est borné par `timeout`, sinon le test ÉCHOUE explicitement."""
import threading
import time


def run_parallel(tasks, timeout: float = 60.0):
    """Lance chaque callable de `tasks` dans son propre thread, tous démarrant en même temps (barrière).
    Renvoie la liste des résultats (même ordre). Lève AssertionError si un thread a levé une exception, s'il est
    resté bloqué au-delà de `timeout`, ou si la barrière n'a pas été franchie à temps."""
    n = len(tasks)
    barrier = threading.Barrier(n, timeout=timeout)
    results, errors = [None] * n, []

    def runner(i, fn):
        try:
            barrier.wait()
            results[i] = fn()
        except BaseException as exc:  # noqa: BLE001  (capturé explicitement, relancé plus bas)
            errors.append((i, f"{type(exc).__name__}: {exc}"))
            try:
                barrier.abort()  # ne bloque pas les autres sur la barrière
            except Exception:  # noqa: BLE001
                pass

    threads = [threading.Thread(target=runner, args=(i, fn), daemon=True, name=f"par-{i}") for i, fn in enumerate(tasks)]
    for t in threads:
        t.start()
    deadline = time.monotonic() + timeout
    for t in threads:
        t.join(max(0.0, deadline - time.monotonic()))
    stuck = [t.name for t in threads if t.is_alive()]
    assert not stuck, f"thread(s) bloqué(s) après {timeout}s : {stuck}"
    assert not errors, f"erreur(s) dans des threads : {errors}"
    return results
