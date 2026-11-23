"""send_email : repli PLAIN/LOGIN quand le serveur coupe pendant AUTH (CRAM-MD5), TLS implicite sur 465, jamais d'exception vers l'appelant."""
import smtplib

import pytest

from app.config import settings
from app.services.notifications import email_channel as ec


class FakeSMTP:
    instances = []
    mode = "ok"  # ok | drop_cram | badauth | down

    def __init__(self, host, port, timeout=None):
        if FakeSMTP.mode == "down":
            raise OSError("unreachable")
        self.host, self.port, self.tls, self.sent, self.closed = host, port, False, None, False
        self.esmtp_features = {"auth": "CRAM-MD5 PLAIN LOGIN"}
        FakeSMTP.instances.append(self)

    def ehlo(self): return (250, b"ok")
    def has_extn(self, n): return n == "starttls"
    def starttls(self): self.tls = True
    def quit(self): self.closed = True
    def close(self): self.closed = True

    def login(self, u, p):
        if FakeSMTP.mode == "badauth":
            raise smtplib.SMTPAuthenticationError(535, b"bad")
        if "CRAM-MD5" in self.esmtp_features["auth"] and FakeSMTP.mode == "drop_cram":
            raise smtplib.SMTPServerDisconnected("Connection unexpectedly closed")

    def sendmail(self, f, to, msg): self.sent = (f, to, msg)


@pytest.fixture(autouse=True)
def _cfg(monkeypatch):
    FakeSMTP.instances, FakeSMTP.mode = [], "ok"
    monkeypatch.setattr(smtplib, "SMTP", FakeSMTP)
    monkeypatch.setattr(smtplib, "SMTP_SSL", FakeSMTP)
    monkeypatch.setattr(settings, "smtp_host", "smtp.test", raising=False)
    monkeypatch.setattr(settings, "smtp_user", "u", raising=False)
    monkeypatch.setattr(settings, "smtp_password", "p", raising=False)
    monkeypatch.setattr(settings, "smtp_port", 587, raising=False)


def test_normal_send_uses_starttls():
    ec.send_email("a@b.c", "Sujet", "Corps")
    assert len(FakeSMTP.instances) == 1 and FakeSMTP.instances[0].tls and FakeSMTP.instances[0].sent[1] == ["a@b.c"]


def test_server_dropping_on_cram_md5_is_retried_with_plain_login():
    FakeSMTP.mode = "drop_cram"
    ec.send_email("a@b.c", "Sujet", "Corps")  # ne lève pas
    ok = [i for i in FakeSMTP.instances if i.sent]
    assert len(FakeSMTP.instances) == 2 and len(ok) == 1 and "CRAM-MD5" not in ok[0].esmtp_features["auth"]


def test_wrong_password_is_not_retried_and_never_raises():
    FakeSMTP.mode = "badauth"
    ec.send_email("a@b.c", "Sujet", "Corps")
    assert len(FakeSMTP.instances) == 1


def test_unreachable_server_never_raises(monkeypatch):
    FakeSMTP.mode = "down"
    ec.send_email("a@b.c", "Sujet", "Corps")


def test_port_465_uses_implicit_tls_without_starttls(monkeypatch):
    monkeypatch.setattr(settings, "smtp_port", 465, raising=False)
    ec.send_email("a@b.c", "Sujet", "Corps")
    assert FakeSMTP.instances[0].port == 465 and not FakeSMTP.instances[0].tls and FakeSMTP.instances[0].sent
