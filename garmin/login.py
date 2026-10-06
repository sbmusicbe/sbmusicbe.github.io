#!/usr/bin/env python3
"""Eenmalig op je EIGEN computer draaien. Logt in bij Garmin (met MFA-code als je die hebt)
en print een token. Zet die token als GitHub-secret GARMIN_TOKENS. Je wachtwoord wordt nergens opgeslagen.
Gebruik:  pip install garminconnect   daarna:  python3 garmin/login.py"""
import getpass
from garminconnect import Garmin

email = input("Garmin e-mail: ").strip()
pw = getpass.getpass("Garmin wachtwoord: ")
g = Garmin(email, pw, prompt_mfa=lambda: input("MFA-code (indien gevraagd): ").strip())
g.login()
print("\n=== KOPIEER ALLES TUSSEN DE LIJNEN als secret GARMIN_TOKENS ===")
print(g.client.dumps())
print("=== EINDE ===")
