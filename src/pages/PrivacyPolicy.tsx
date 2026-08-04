import Seo from "@/components/Seo";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useTenant } from "@/config/tenant";

export default function PrivacyPolicy() {
  const { tenant } = useTenant();
  const legalName = tenant.legal_entity || tenant.venue_name;
  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <Seo title={`Privacy Policy | ${tenant.venue_name}`} description={`How ${tenant.venue_name} collects, uses and protects your personal information, including booking data, recordings and marketing preferences.`} path="/privacy" />
      <div className="mx-auto max-w-3xl">
        <Card>
          <CardHeader>
            <CardTitle className="font-anton text-2xl md:text-3xl">Privacy Policy</CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[70vh] pr-4">
              <div className="space-y-4 text-sm text-muted-foreground">
                <p>
                  {legalName} ("{tenant.venue_name}", "we", "us", or "our") is committed to protecting your personal information. This Privacy Policy explains how we collect, use, store, and disclose your personal data when you use our website, mobile applications, booking platform, and venue services.
                </p>

                <h3 className="font-semibold text-foreground">1. Information We Collect</h3>
                <p>
                  We may collect personal information including your name, email address, phone number, payment details, booking history, membership status, swing session data, and device information (including push notification tokens) when you interact with our services.
                </p>

                <h3 className="font-semibold text-foreground">2. How We Use Your Information</h3>
                <p>
                  We use your information to process bookings and payments, manage memberships, provide access to our facilities, send service-related notifications, improve our services, and communicate marketing offers where you have consented.
                </p>

                <h3 className="font-semibold text-foreground">3. Push Notifications</h3>
                <p>
                  With your permission, we collect a push notification token from your device to send booking reminders, gate access information, and service updates. You can disable push notifications at any time through your device settings.
                </p>

                <h3 className="font-semibold text-foreground">4. Recording, Filming and Media</h3>
                <p>
                  Our bays are monitored by security cameras, and gameplay may be video and/or audio recorded — including automatically during league rounds, competitions and events. By using our facility you consent to being recorded, and to Birdies using that footage, imagery and associated gameplay data (such as your name, username, scores and handicap) for promotional, marketing, social media, leaderboard and broadcast purposes. You can opt out of publicly shared content at any time by contacting us.
                </p>

                <h3 className="font-semibold text-foreground">5. Data Sharing</h3>
                <p>
                  We do not sell your personal information. We may share data with trusted service providers (such as payment processors, video hosting, email delivery services, and cloud hosting providers) solely for the purpose of operating our business.
                </p>


                <h3 className="font-semibold text-foreground">6. Data Security</h3>
                <p>
                  We implement reasonable technical and organisational measures to protect your personal information from unauthorised access, disclosure, or loss.
                </p>

                <h3 className="font-semibold text-foreground">7. Your Rights</h3>
                <p>
                  You have the right to access, correct, or delete your personal information. To make a request, contact us using the details below.
                </p>

                <h3 className="font-semibold text-foreground">8. Changes to This Policy</h3>
                <p>
                  We may update this Privacy Policy from time to time. Changes will be posted on our website and mobile applications. Continued use of our services constitutes acceptance of the updated policy.
                </p>

                <h3 className="font-semibold text-foreground">9. Contact Us</h3>
                <p>
                  If you have any questions about this Privacy Policy or how we handle your data, please contact {legalName}.
                </p>

                <p className="pt-4 text-xs">
                  Last updated: {new Date().toLocaleDateString('en-AU')}.
                </p>
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
