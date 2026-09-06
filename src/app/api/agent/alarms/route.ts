import { db } from "@/lib/db";
import { jsonError, requireApiSession } from "@/lib/api";
export async function GET(request:Request){
  const session=await requireApiSession(request.headers);if(!session)return jsonError("ابتدا وارد حساب شوید",401);
  const rows=await db.reminder.findMany({where:{userId:session.user.id,status:"DEVICE_PENDING",scheduledFor:{gt:new Date()}},include:{task:true,meeting:true},take:200,orderBy:{scheduledFor:"asc"}});
  return Response.json({data:rows.map(r=>({id:r.id,title:r.task?.title??r.meeting?.title??"یادآوری",scheduledFor:r.scheduledFor,channel:r.channel}))},{headers:{"Cache-Control":"no-store"}});
}
