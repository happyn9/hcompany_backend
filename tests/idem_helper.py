import uuid


def with_idem(client):
    """Les endpoints qui déplacent de l'argent exigent « Idempotency-Key » : ce client de test en ajoute une NOUVELLE à chaque appel (sauf si le test en fournit une)."""
    orig = client.post

    def post(url, *a, **kw):
        if str(url).endswith(("/transfers", "/pay")) and "headers" not in kw:
            kw["headers"] = {"Idempotency-Key": uuid.uuid4().hex}
        return orig(url, *a, **kw)
    client.post = post
    return client
