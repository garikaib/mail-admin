#!/usr/bin/env python3
import sys
import os
import unittest
from datetime import datetime, timedelta
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

# Add project root to path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))

from backend.app.core.database import Base
from backend.app.models import MailDomain, GeoDomainPolicy, GeoUserException, GeoActiveBan, GeoSshPolicy, GeoRegion
from backend.app.services.geo_policy import check_login_policy, get_country_code

class TestGeoAuthPolicy(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        # Create memory SQLite database
        cls.engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(bind=cls.engine)
        cls.SessionLocal = sessionmaker(bind=cls.engine)

    def setUp(self):
        self.db = self.SessionLocal()
        # Clean up database
        self.db.query(MailDomain).delete()
        self.db.query(GeoDomainPolicy).delete()
        self.db.query(GeoUserException).delete()
        self.db.query(GeoActiveBan).delete()
        self.db.query(GeoSshPolicy).delete()
        self.db.query(GeoRegion).delete()
        self.db.commit()

        # Seed default test domain
        self.domain = MailDomain(id=1, name="zimprices.co.zw", is_active=True)
        self.db.add(self.domain)
        
        # Seed default regions
        default_regions = {
            "SADC": "AO,BW,KM,CD,SZ,LS,MG,MW,MU,MZ,NA,SC,ZA,TZ,ZM,ZW",
            "EUROPE": "AL,AD,AT,BY,BE,BA,BG,HR,CY,CZ,DK,EE,FI,FR,DE,GR,HU,IS,IE,IT,LV,LI,LT,LU,MT,MD,MC,ME,NL,MK,NO,PL,PT,RO,RU,SM,RS,SK,SI,ES,SE,CH,UA,GB,VA"
        }
        for name, countries in default_regions.items():
            self.db.add(GeoRegion(name=name, countries=countries))
        self.db.commit()

    def tearDown(self):
        self.db.close()

    def test_default_sadc_fallback(self):
        """
        If no GeoDomainPolicy is configured, users are allowed from SADC countries
        but blocked from others.
        """
        # Mock get_country_code to return ZW (Zimbabwe - inside SADC)
        import backend.app.services.geo_policy as gp
        original_cc = gp.get_country_code
        try:
            gp.get_country_code = lambda ip: "ZW"
            allowed, reason = check_login_policy(self.db, "user@zimprices.co.zw", "1.1.1.1", "mail")
            self.assertTrue(allowed)
            self.assertIn("SADC", reason)

            # Blocked outside SADC (e.g., US)
            gp.get_country_code = lambda ip: "US"
            allowed, reason = check_login_policy(self.db, "user@zimprices.co.zw", "1.1.1.1", "mail")
            self.assertFalse(allowed)
            self.assertIn("denied", reason.lower())
        finally:
            gp.get_country_code = original_cc

    def test_domain_level_policies(self):
        """
        If a domain policy is defined, it limits to designated allowed countries.
        """
        policy = GeoDomainPolicy(domain_id=self.domain.id, allowed_countries="ZA,GB", allowed_regions="", augment_default=False)
        self.db.add(policy)
        self.db.commit()

        import backend.app.services.geo_policy as gp
        original_cc = gp.get_country_code
        try:
            # Allowed country in list (South Africa)
            gp.get_country_code = lambda ip: "ZA"
            allowed, reason = check_login_policy(self.db, "user@zimprices.co.zw", "1.1.1.1", "mail")
            self.assertTrue(allowed)

            # Blocked country not in list (Zimbabwe - even though ZW is SADC, augment_default is False)
            gp.get_country_code = lambda ip: "ZW"
            allowed, reason = check_login_policy(self.db, "user@zimprices.co.zw", "1.1.1.1", "mail")
            self.assertFalse(allowed)
        finally:
            gp.get_country_code = original_cc

    def test_user_exception_override(self):
        """
        User exception override permits logins even if blocked by domain policy.
        """
        # Domain allows only ZA
        policy = GeoDomainPolicy(domain_id=self.domain.id, allowed_countries="ZA", allowed_regions="", augment_default=False)
        self.db.add(policy)
        
        # User exception allows US
        exception = GeoUserException(
            username="traveler@zimprices.co.zw",
            service="all",
            allowed_countries="US",
            expires_at=datetime.utcnow() + timedelta(days=1)
        )
        self.db.add(exception)
        self.db.commit()

        import backend.app.services.geo_policy as gp
        original_cc = gp.get_country_code
        try:
            # Traveler allowed in US
            gp.get_country_code = lambda ip: "US"
            allowed, reason = check_login_policy(self.db, "traveler@zimprices.co.zw", "1.1.1.1", "mail")
            self.assertTrue(allowed)
            self.assertIn("user override exception", reason)

            # Traveler blocked in ZW
            gp.get_country_code = lambda ip: "ZW"
            allowed, reason = check_login_policy(self.db, "traveler@zimprices.co.zw", "1.1.1.1", "mail")
            self.assertFalse(allowed)
        finally:
            gp.get_country_code = original_cc

    def test_user_exception_expiry(self):
        """
        Expired exceptions revert to standard policy.
        """
        policy = GeoDomainPolicy(domain_id=self.domain.id, allowed_countries="ZA", allowed_regions="", augment_default=False)
        self.db.add(policy)
        
        # Exception expired 1 hour ago
        exception = GeoUserException(
            username="expired@zimprices.co.zw",
            service="all",
            allowed_countries="US",
            expires_at=datetime.utcnow() - timedelta(hours=1)
        )
        self.db.add(exception)
        self.db.commit()

        import backend.app.services.geo_policy as gp
        original_cc = gp.get_country_code
        try:
            gp.get_country_code = lambda ip: "US"
            allowed, reason = check_login_policy(self.db, "expired@zimprices.co.zw", "1.1.1.1", "mail")
            self.assertFalse(allowed)  # Expired, so denied
        finally:
            gp.get_country_code = original_cc

    def test_ssh_policy_and_granular_exceptions(self):
        """
        Tests dedicated SSH geofencing policy and service-specific granular user exceptions.
        """
        # Configure SSH policy (allows only ZA and GB, augment_default=False)
        ssh_policy = GeoSshPolicy(allowed_countries="ZA,GB", allowed_regions="", augment_default=False)
        self.db.add(ssh_policy)

        # SSH exception specifically for traveler (allows US only on SSH)
        ssh_exc = GeoUserException(
            username="ubuntu",
            service="ssh",
            allowed_countries="US",
            expires_at=datetime.utcnow() + timedelta(days=1)
        )
        self.db.add(ssh_exc)

        # Mail exception for another user (allows US only on mail, blocked on SSH)
        mail_exc = GeoUserException(
            username="mailuser",
            service="mail",
            allowed_countries="US",
            expires_at=datetime.utcnow() + timedelta(days=1)
        )
        self.db.add(mail_exc)
        self.db.commit()

        import backend.app.services.geo_policy as gp
        original_cc = gp.get_country_code
        try:
            # 1. Test SSH policy list
            gp.get_country_code = lambda ip: "ZA"
            allowed, reason = check_login_policy(self.db, "root", "1.1.1.1", "ssh")
            self.assertTrue(allowed)
            self.assertIn("SSH policy list", reason)

            gp.get_country_code = lambda ip: "ZW"  # ZW is SADC but SSH policy has augment_default=False
            allowed, reason = check_login_policy(self.db, "root", "1.1.1.1", "ssh")
            self.assertFalse(allowed)

            # 2. Test granular SSH exception
            gp.get_country_code = lambda ip: "US"
            allowed, reason = check_login_policy(self.db, "ubuntu", "1.1.1.1", "ssh")
            self.assertTrue(allowed)
            self.assertIn("override exception (ssh)", reason)

            # 3. Test that mail exception does not apply to SSH
            gp.get_country_code = lambda ip: "US"
            allowed, reason = check_login_policy(self.db, "mailuser", "1.1.1.1", "ssh")
            self.assertFalse(allowed)  # Blocked because exception is service='mail' only
        finally:
            gp.get_country_code = original_cc

    def test_augment_vs_supplant_mode(self):
        """
        Verify augment_default=True automatically allows SADC countries, while augment_default=False does not.
        """
        # Configure SSH policy (allows only GB, augment_default=True)
        ssh_policy_augment = GeoSshPolicy(allowed_countries="GB", allowed_regions="", augment_default=True)
        self.db.add(ssh_policy_augment)
        self.db.commit()

        import backend.app.services.geo_policy as gp
        original_cc = gp.get_country_code
        try:
            # Allowed from GB (in allowed_countries)
            gp.get_country_code = lambda ip: "GB"
            allowed, reason = check_login_policy(self.db, "root", "1.1.1.1", "ssh")
            self.assertTrue(allowed)

            # Allowed from ZW (not in allowed_countries, but SADC and augment_default is True)
            gp.get_country_code = lambda ip: "ZW"
            allowed, reason = check_login_policy(self.db, "root", "1.1.1.1", "ssh")
            self.assertTrue(allowed)

            # Now update SSH policy to augment_default=False
            ssh_policy_augment.augment_default = False
            self.db.commit()

            # Allowed from GB
            gp.get_country_code = lambda ip: "GB"
            allowed, reason = check_login_policy(self.db, "root", "1.1.1.1", "ssh")
            self.assertTrue(allowed)

            # Blocked from ZW (augment_default is now False)
            gp.get_country_code = lambda ip: "ZW"
            allowed, reason = check_login_policy(self.db, "root", "1.1.1.1", "ssh")
            self.assertFalse(allowed)
        finally:
            gp.get_country_code = original_cc

if __name__ == "__main__":
    unittest.main()

