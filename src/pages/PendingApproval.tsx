import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Clock, Mail, BellRing, Compass } from 'lucide-react';
import JoinStepper from '@/components/navigation/JoinStepper';

export default function PendingApproval() {
  const { user, signOut } = useAuth();

  if (!user) return <Navigate to="/login" replace />;
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-background p-4">
      <div className="w-full max-w-md">
        <JoinStepper current="approval" />
      </div>
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Clock className="h-6 w-6" />
          </div>
          <CardTitle className="text-2xl">You're almost in</CardTitle>
          <CardDescription>
            An administrator has been notified. You'll get access as soon as they approve your account.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3 rounded-lg border bg-muted/30 p-4 text-left">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              What happens next
            </p>
            <ul className="space-y-2 text-sm">
              <li className="flex gap-2">
                <BellRing className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <span>Your administrator gets a notification right now.</span>
              </li>
              <li className="flex gap-2">
                <Mail className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <span>You'll receive an email when access is granted.</span>
              </li>
              <li className="flex gap-2">
                <Compass className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <span>On first login a guided tour walks you through everything.</span>
              </li>
            </ul>
          </div>
          <Button variant="outline" asChild className="w-full">
            <a href="mailto:?subject=Access%20request%20-%20Gulf%20Cryo%20Document%20Manager&body=Hi%2C%0A%0AI%20just%20signed%20up%20and%20I'm%20waiting%20for%20approval.%20Could%20you%20please%20approve%20my%20account%3F%0A%0AThanks!">
              <Mail className="mr-2 h-4 w-4" />
              Email an admin to speed it up
            </a>
          </Button>
          <Button variant="ghost" onClick={signOut} className="w-full">
            Sign out
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
