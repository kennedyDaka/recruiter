/**
 * Support Center - simple client-facing support page.
 * WhatsApp, email, and phone - thats all clients need.
 */
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listIncidentsFn, getIncidentFn } from "@/lib/incident.functions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { LifeBuoy, MessageCircle, Mail, Phone, ExternalLink, Clock, ChevronRight, BookOpen, HelpCircle } from "lucide-react";

export const Route = createFileRoute("/_authenticated/support")({ component: SupportCenterPage });

const SUPPORT_PHONE = "+265 882 575 364";
const SUPPORT_EMAIL = "support@recruitermw.com";
const SUPPORT_WHATSAPP = "265882575364";

const STATUS_COLORS = {
  detected: "bg-red-100 text-red-800", open: "bg-blue-100 text-blue-800",
  acknowledged: "bg-purple-100 text-purple-800", investigating: "bg-orange-100 text-orange-800",
  waiting_for_customer: "bg-yellow-100 text-yellow-800", resolved: "bg-green-100 text-green-800",
  closed: "bg-gray-100 text-gray-800", reopened: "bg-red-100 text-red-800",
};

function SupportCenterPage() {
  const [sel, setSel] = useState(null);
  const listInc = useServerFn(listIncidentsFn);
  const getInc = useServerFn(getIncidentFn);
  const { data: incData } = useQuery({ queryKey: ["inc"], queryFn: () => listInc({ data: {} }) });
  const { data: incDetail } = useQuery({ queryKey: ["incD", sel], queryFn: () => getInc({ data: { id: sel } }), enabled: !!sel });
  const open = (incData?.incidents || []).filter(i => !["resolved","closed"].includes(i.status));

  return (
    <div className="mx-auto max-w-4xl space-y-8 p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><LifeBuoy className="size-6" />Help & Support</h1>
        <p className="text-muted-foreground">Need help? Reach us through any of these channels.</p>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="cursor-pointer hover:border-green-500 hover:shadow-md transition-all" onClick={() => window.open("https://wa.me/" + SUPPORT_WHATSAPP + "?text=" + encodeURIComponent("Hello RecruiterMW Support"), "_blank")}>
          <CardContent className="flex flex-col items-center gap-3 p-6 text-center">
            <div className="rounded-full bg-green-100 p-3"><MessageCircle className="size-8 text-green-600" /></div>
            <div><p className="font-semibold">WhatsApp</p><p className="text-sm text-muted-foreground">Chat with us instantly</p></div>
            <Button size="sm" className="bg-green-600 hover:bg-green-700">Start Chat<ExternalLink className="ml-1 size-3" /></Button>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:border-blue-500 hover:shadow-md transition-all" onClick={() => window.open("mailto:" + SUPPORT_EMAIL + "?subject=" + encodeURIComponent("RecruiterMW Support"), "_blank")}>
          <CardContent className="flex flex-col items-center gap-3 p-6 text-center">
            <div className="rounded-full bg-blue-100 p-3"><Mail className="size-8 text-blue-600" /></div>
            <div><p className="font-semibold">Email</p><p className="text-sm text-muted-foreground">{SUPPORT_EMAIL}</p></div>
            <Button size="sm" variant="outline">Send Email<ExternalLink className="ml-1 size-3" /></Button>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:border-orange-500 hover:shadow-md transition-all" onClick={() => window.open("tel:" + SUPPORT_PHONE, "_blank")}>
          <CardContent className="flex flex-col items-center gap-3 p-6 text-center">
            <div className="rounded-full bg-orange-100 p-3"><Phone className="size-8 text-orange-600" /></div>
            <div><p className="font-semibold">Call Us</p><p className="text-sm text-muted-foreground">{SUPPORT_PHONE}</p></div>
            <Button size="sm" variant="outline">Call Now<ExternalLink className="ml-1 size-3" /></Button>
          </CardContent>
        </Card>
      </div>
      <Card className="bg-muted/30"><CardContent className="flex items-center gap-3 p-4"><Clock className="size-5 text-muted-foreground" /><div><p className="text-sm font-medium">Support Hours</p><p className="text-sm text-muted-foreground">Monday - Friday, 8:00 AM - 5:00 PM (CAT)</p></div></CardContent></Card>
      {open.length > 0 && <div><h2 className="text-lg font-semibold mb-3">Your Open Requests</h2><div className="space-y-2">{open.map(i => <Card key={i.id} className="cursor-pointer hover:bg-muted/50" onClick={() => setSel(i.id)}><CardContent className="flex items-center gap-3 p-4"><div className="flex-1"><div className="flex items-center gap-2"><span className="font-mono text-xs text-muted-foreground">OP-{String(i.incident_number).padStart(5,"0")}</span><Badge className={STATUS_COLORS[i.status] || ""}>{i.status?.replace(/_/g," ")}</Badge></div><p className="mt-1 font-medium">{i.title}</p></div><ChevronRight className="size-4 text-muted-foreground" /></CardContent></Card>)}</div></div>}
      <div><h2 className="text-lg font-semibold mb-3">Quick Help</h2><div className="grid gap-3 md:grid-cols-2"><Card className="hover:bg-muted/50"><CardContent className="flex items-center gap-3 p-4"><BookOpen className="size-5 text-primary" /><div><p className="font-medium">Help Center</p><p className="text-sm text-muted-foreground">Browse articles and guides</p></div></CardContent></Card><Card className="hover:bg-muted/50"><CardContent className="flex items-center gap-3 p-4"><HelpCircle className="size-5 text-primary" /><div><p className="font-medium">FAQ</p><p className="text-sm text-muted-foreground">Common questions answered</p></div></CardContent></Card></div></div>
      {incDetail && <Dialog open={!!sel} onOpenChange={o => !o && setSel(null)}><DialogContent className="max-w-lg"><DialogHeader><DialogTitle className="flex items-center gap-2"><span className="font-mono text-sm text-muted-foreground">OP-{String(incDetail.incident.incident_number).padStart(5,"0")}</span><Badge className={STATUS_COLORS[incDetail.incident.status] || ""}>{incDetail.incident.status?.replace(/_/g," ")}</Badge></DialogTitle></DialogHeader><div className="space-y-3"><h3 className="font-semibold">{incDetail.incident.title}</h3>{incDetail.incident.description && <p className="text-sm text-muted-foreground">{incDetail.incident.description}</p>}<p className="text-sm text-muted-foreground">Created: {new Date(incDetail.incident.created_at).toLocaleString("en-GB")}</p>{incDetail.notes.length > 0 && <div><p className="font-medium text-sm mb-2">Updates</p>{incDetail.notes.map(n => <div key={n.id} className="rounded-lg border p-3 mb-2"><p className="text-xs text-muted-foreground mb-1">{n.author_name || "Support"} - {new Date(n.created_at).toLocaleString("en-GB")}</p><p className="text-sm">{n.body}</p></div>)}</div>}</div></DialogContent></Dialog>}
    </div>
  );
}
