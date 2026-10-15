-- Transactional integration checks: every fixture and access change is rolled back.
begin;
do $$
declare
 u uuid:=gen_random_uuid(); u2 uuid:=gen_random_uuid(); u3 uuid:=gen_random_uuid(); buyer3 uuid:=gen_random_uuid(); oe uuid:=gen_random_uuid(); buyer uuid:=gen_random_uuid(); buyer2 uuid:=gen_random_uuid();
 pa uuid:=gen_random_uuid(); pb uuid:=gen_random_uuid(); po uuid:=gen_random_uuid();
 shared uuid:=gen_random_uuid(); ca uuid:=gen_random_uuid(); cb uuid:=gen_random_uuid(); oldcourse uuid:=gen_random_uuid();
 product uuid:=gen_random_uuid(); offer uuid:=gen_random_uuid(); oa uuid:=gen_random_uuid(); ob uuid:=gen_random_uuid(); oc uuid:=gen_random_uuid(); od uuid:=gen_random_uuid();
 result jsonb; before_exp timestamptz;
begin
 insert into auth.users(id,email) values(u,u||'@example.invalid'),(u2,u2||'@example.invalid'),(u3,u3||'@example.invalid');
 insert into public.profiles(id,email,status) values(u,u||'@example.invalid','active'),(u2,u2||'@example.invalid','active'),(u3,u3||'@example.invalid','active') on conflict(id) do update set email=excluded.email,status='active';
 insert into public.perfis(id,email,tipo_acesso,status_assinatura,acesso_expira_em) values(u,u||'@example.invalid','avista','ativo',current_date+120),(u2,u2||'@example.invalid','rotina','ativo',null),(u3,u3||'@example.invalid','rotina','ativo',null) on conflict(id) do update set tipo_acesso=excluded.tipo_acesso,status_assinatura=excluded.status_assinatura,acesso_expira_em=excluded.acesso_expira_em;
 insert into public.customers(id,email,name) values(buyer,u||'@example.invalid','SQL fixture'),(buyer2,u2||'@example.invalid','SQL fixture'),(buyer3,u3||'@example.invalid','SQL fixture');
 insert into public.plans(id,name,offer_id,period_days) values(pa,'A',pa::text,30),(pb,'B',pb::text,60),(po,'Legacy',po::text,120);
 insert into public.courses(id,slug,title) values(shared,shared::text,'Shared'),(ca,ca::text,'A'),(cb,cb::text,'B'),(oldcourse,oldcourse::text,'Legacy');
 insert into public.plan_courses(plan_id,course_id) values(pa,shared),(pa,ca),(pb,shared),(pb,cb),(po,oldcourse);
 insert into public.products(id,name,slug,plan_id) values(product,'SQL fixture',product::text,pa);
 insert into public.offers(id,product_id,slug,name,price_cents) values(offer,product,offer::text,'SQL fixture',4700);
 insert into public.orders(id,customer_id,offer_id,status,payment_method,subtotal_cents,total_cents,paid_at,event_id) values
 (oa,buyer,offer,'paid','credit_card',4700,4700,now(),'checkout:'||oa),
 (ob,buyer,offer,'paid','credit_card',4700,4700,now(),'checkout:'||ob),
 (oc,buyer2,offer,'paid','credit_card',4700,4700,now()-interval '5 days','checkout:'||oc),
 (od,buyer2,offer,'paid','credit_card',4700,4700,now(),'cycle:'||od),
 (oe,buyer3,offer,'paid','credit_card',4700,4700,now(),'checkout:'||oe);
 insert into public.enrollments(profile_id,course_id,status,source,expires_at) values(u,oldcourse,'active','guru',null);
 insert into public.profile_plans(profile_id,plan_id) values(u,po);
 execute 'set local role service_role';
 result:=public.checkout_apply_access(oa,u,array[pa],false);
 if result->>'status'<>'completed' then raise exception 'First grant failed: %',result; end if;
 perform public.checkout_apply_access(ob,u,array[pb],false);
 if (select count(*) from public.enrollments where profile_id=u and course_id=shared and status='active')<>1 then raise exception 'Shared course duplicated'; end if;
 select expires_at into before_exp from public.enrollments where profile_id=u and course_id=shared;
 if before_exp<now()+interval '59 days' then raise exception 'Longest duration lost'; end if;
 update public.orders set status='refunded' where id=ob;
 result:=public.checkout_apply_access(ob,u);
 if result->>'status'<>'completed' then raise exception 'Refund failed: %',result; end if;
 if not exists(select 1 from public.enrollments where profile_id=u and course_id=shared and status='active' and expires_at between now()+interval '29 days' and now()+interval '31 days') then raise exception 'Other purchase not preserved'; end if;
 if not exists(select 1 from public.enrollments where profile_id=u and course_id=cb and status='refunded') then raise exception 'Refunded exclusive course remains active'; end if;
 if not exists(select 1 from public.enrollments where profile_id=u and course_id=oldcourse and status='active' and expires_at is null) then raise exception 'Legacy lifetime lost'; end if;
 update public.orders set status='chargedback' where id=oa;
 perform public.checkout_apply_access(oa,u);
 perform public.checkout_apply_access(ob,u);
 if exists(select 1 from public.profile_plans where profile_id=u and plan_id in(pa,pb)) then raise exception 'Revoked plan remains'; end if;
 if not exists(select 1 from public.profile_plans where profile_id=u and plan_id=po) then raise exception 'Legacy plan removed'; end if;
 if (select acesso_expira_em from public.perfis where id=u)<>current_date+120 then raise exception 'Legacy duration changed'; end if;
 -- Renewal of same plan extends only once, from the new paid_at.
 perform public.checkout_apply_access(oc,u2,array[pa],true);
 perform public.checkout_apply_access(od,u2,array[pa],false);
 if (select count(*) from public.enrollments where profile_id=u2 and course_id=shared and status='active')<>1 then raise exception 'Renewal duplicated course'; end if;
 select expires_at into before_exp from public.enrollments where profile_id=u2 and course_id=shared;
 perform public.checkout_apply_access(od,u2,array[pa],false);
 if (select expires_at from public.enrollments where profile_id=u2 and course_id=shared)<>before_exp then raise exception 'Retry extended period'; end if;
 update public.orders set status='refunded' where id=od;
 perform public.checkout_apply_access(od,u2);
 if not exists(select 1 from public.enrollments where profile_id=u2 and course_id=shared and status='active' and expires_at<before_exp) then raise exception 'Refund of renewal removed original access'; end if;
 -- A later external edit must never be overwritten by an automatic refund.
 update public.enrollments set expires_at=now()+interval '200 days',updated_at=clock_timestamp() where profile_id=u2 and course_id=shared;
 update public.orders set status='refunded' where id=oc;
 result:=public.checkout_apply_access(oc,u2);
 if result->>'status'<>'review_required' then raise exception 'External edit was not protected: %',result; end if;
 if (select expires_at from public.enrollments where profile_id=u2 and course_id=shared)<now()+interval '199 days' then raise exception 'External access overwritten'; end if;
 -- Simulate individual plan expiry, then total expiry, without touching real data.
 perform public.checkout_apply_access(oe,u3,array[pa,pb],true);
 update public.checkout_access_grants set grants=(select jsonb_agg(case when (x->>'plan_id')::uuid=pa then jsonb_set(x,'{expires_at}',to_jsonb(now()-interval '1 day')) else x end) from jsonb_array_elements(grants) x),next_expiration=now()-interval '1 day' where order_id=oe;
 result:=public.checkout_apply_access(oe,u3);
 if result->>'status'<>'completed' then raise exception 'Partial expiry failed: %',result; end if;
 if exists(select 1 from public.profile_plans where profile_id=u3 and plan_id=pa) then raise exception 'Expired plan remains'; end if;
 if not exists(select 1 from public.enrollments where profile_id=u3 and course_id=shared and status='active') then raise exception 'Longer shared plan lost on partial expiry'; end if;
 update public.checkout_access_grants set grants=(select jsonb_agg(jsonb_set(x,'{expires_at}',to_jsonb(now()-interval '1 day'))) from jsonb_array_elements(grants) x),expires_at=now()-interval '1 day',next_expiration=now()-interval '1 day' where order_id=oe;
 perform public.checkout_apply_access(oe,u3);
 if exists(select 1 from public.enrollments where profile_id=u3 and status='active') then raise exception 'Expired course remains'; end if;
 if (select reason from public.checkout_access_grants where order_id=oe)<>'expired' then raise exception 'Expiry not recorded'; end if;
 if (select status_assinatura from public.perfis where id=u3)<>'cancelado' then raise exception 'Expired legacy access remains'; end if;
 if not (select review_required from public.checkout_access_grants where order_id=oc) then raise exception 'Manual review not separated from expiry queue'; end if;
 raise notice 'PASS: grants, shared access, refund, chargeback, renewal, deduplication, legacy and external edits';
end;
$$;
rollback;
