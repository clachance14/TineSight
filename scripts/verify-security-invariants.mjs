// Local, disposable Postgres runtime verification. No production connections.
// npm install --prefix /tmp/tinesight-db-tests @electric-sql/pglite
// TINESIGHT_PGLITE_MODULE=/tmp/tinesight-db-tests/node_modules/@electric-sql/pglite/dist/index.js node scripts/verify-security-invariants.mjs
import { readFile } from 'node:fs/promises'
import assert from 'node:assert/strict'
const {PGlite}=await import(process.env.TINESIGHT_PGLITE_MODULE || '@electric-sql/pglite')
const db=new PGlite()
const owner='00000000-0000-4000-8000-000000000001',other='00000000-0000-4000-8000-000000000002'
const photo='00000000-0000-4000-8000-000000000011',foreignPhoto='00000000-0000-4000-8000-000000000012'
const buck='00000000-0000-4000-8000-000000000021',foreignBuck='00000000-0000-4000-8000-000000000022'
const detection='00000000-0000-4000-8000-000000000031',foreignDetection='00000000-0000-4000-8000-000000000032'
const session='00000000-0000-4000-8000-000000000041',foreignSession='00000000-0000-4000-8000-000000000042'
const batch='00000000-0000-4000-8000-000000000051',foreignBatch='00000000-0000-4000-8000-000000000052'
try {
 await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
 CREATE SCHEMA auth;
 CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql AS $$ SELECT current_user::text $$;
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$;
 CREATE FUNCTION assert_self_or_service(uuid) RETURNS void LANGUAGE plpgsql AS $$ BEGIN IF auth.uid() IS DISTINCT FROM $1 THEN RAISE EXCEPTION 'access denied'; END IF; END $$;
 CREATE TABLE upload_sessions(id uuid PRIMARY KEY,user_id uuid);
 CREATE TABLE processing_batches(id uuid PRIMARY KEY,user_id uuid,upload_session_id uuid REFERENCES upload_sessions);
 CREATE TABLE cameras(id uuid PRIMARY KEY,user_id uuid);
 CREATE TABLE locations(id uuid PRIMARY KEY,user_id uuid);
 CREATE TABLE images(id uuid PRIMARY KEY,user_id uuid,batch_id uuid REFERENCES processing_batches,camera_id uuid,location_id uuid,file_path text,thumbnail_path text,medium_path text,captured_at timestamptz);
 CREATE TABLE deer(id uuid PRIMARY KEY,user_id uuid,name text,status text,notes text,first_seen date,last_seen date,created_at timestamptz,reference_detection_id uuid,representative_image_id uuid);
 CREATE TABLE detections(id uuid PRIMARY KEY,image_id uuid REFERENCES images,deer_id uuid REFERENCES deer,crop_file_path text,deleted_at timestamptz,score_gross int,is_trophy bool,species text,sex text,age_class text,size_class text,estimated_point_range text,gemini_confidence numeric,quality_status text,quality_score numeric);
 CREATE TABLE match_candidates(id uuid PRIMARY KEY,detection_id uuid REFERENCES detections ON DELETE CASCADE,candidate_deer_id uuid REFERENCES deer);
 CREATE TABLE showcases(id uuid PRIMARY KEY,user_id uuid,title text,token text,is_active bool);
 CREATE TABLE showcase_bucks(showcase_id uuid,deer_id uuid,position int);
 INSERT INTO upload_sessions VALUES('${session}','${owner}'),('${foreignSession}','${other}');
 INSERT INTO processing_batches VALUES('${batch}','${owner}','${session}'),('${foreignBatch}','${other}','${foreignSession}');
 INSERT INTO images(id,user_id,batch_id,file_path,medium_path) VALUES('${photo}','${owner}','${batch}','${owner}/original.jpg','medium/${photo}.webp'),('${foreignPhoto}','${other}','${foreignBatch}','${other}/original.jpg','medium/${foreignPhoto}.webp');
 INSERT INTO deer(id,user_id,name,created_at) VALUES('${buck}','${owner}','Own buck',now()),('${foreignBuck}','${other}','Private victim name',now());
 INSERT INTO detections(id,image_id,crop_file_path,score_gross,is_trophy) VALUES('${detection}','${photo}','crops/${detection}.jpg',150,true),('${foreignDetection}','${foreignPhoto}','crops/${foreignDetection}.jpg',160,true);
 GRANT USAGE ON SCHEMA public,auth TO authenticated; GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
 ALTER TABLE detections ENABLE ROW LEVEL SECURITY; CREATE POLICY detection_owner ON detections FOR ALL TO authenticated USING(EXISTS(SELECT 1 FROM images WHERE images.id=detections.image_id AND images.user_id=auth.uid()));
 ALTER TABLE images ENABLE ROW LEVEL SECURITY; CREATE POLICY image_owner ON images FOR ALL TO authenticated USING(user_id=auth.uid());
 ALTER TABLE deer ENABLE ROW LEVEL SECURITY; CREATE POLICY deer_owner ON deer FOR ALL TO authenticated USING(user_id=auth.uid());
 ALTER TABLE processing_batches ENABLE ROW LEVEL SECURITY; CREATE POLICY batch_owner ON processing_batches FOR ALL TO authenticated USING(user_id=auth.uid());
 ALTER TABLE upload_sessions ENABLE ROW LEVEL SECURITY; CREATE POLICY session_owner ON upload_sessions FOR ALL TO authenticated USING(user_id=auth.uid());
 SELECT set_config('request.jwt.claim.sub','${owner}',false); SET ROLE authenticated;`)
 // Original source-only RLS permits linking a known foreign Buck UUID.
 await db.exec(`UPDATE detections SET deer_id='${foreignBuck}' WHERE id='${detection}'`)
 assert.equal((await db.query(`SELECT deer_id FROM detections WHERE id='${detection}'`)).rows[0].deer_id,foreignBuck)
 console.log('RED reproduced: source-only RLS accepts foreign Buck association')
 await db.exec(`UPDATE detections SET deer_id=NULL WHERE id='${detection}'; RESET ROLE;`)
 await db.exec(await readFile(new URL('../supabase/migrations/054_security_reference_invariants.sql',import.meta.url),'utf8'))
 await db.exec('SET ROLE authenticated;')
 async function denied(sql,label) { await assert.rejects(db.exec(sql),error=>error.code==='23514');console.log(`PASS ${label}`) }
 await denied(`UPDATE detections SET deer_id='${foreignBuck}' WHERE id='${detection}'`,'cross-tenant Buck link rejected')
 await denied(`UPDATE detections SET crop_file_path='crops/${foreignDetection}.jpg' WHERE id='${detection}'`,'forged crop path rejected')
 await denied(`UPDATE images SET medium_path='medium/${foreignPhoto}.webp' WHERE id='${photo}'`,'forged medium path rejected')
 await denied(`UPDATE images SET file_path='${other}/original.jpg' WHERE id='${photo}'`,'foreign original path rejected')
 await denied(`UPDATE images SET file_path='${owner}/../${other}/original.jpg' WHERE id='${photo}'`,'path traversal rejected')
 await denied(`UPDATE images SET batch_id='${foreignBatch}' WHERE id='${photo}'`,'foreign batch rejected')
 await denied(`UPDATE processing_batches SET upload_session_id='${foreignSession}' WHERE id='${batch}'`,'foreign session rejected')
 await denied(`UPDATE deer SET reference_detection_id='${foreignDetection}' WHERE id='${buck}'`,'foreign Buck reference rejected')
 await denied(`INSERT INTO match_candidates VALUES(gen_random_uuid(),'${detection}','${foreignBuck}')`,'foreign match rejected')
 await db.exec(`UPDATE detections SET deer_id='${buck}' WHERE id='${detection}'; UPDATE deer SET reference_detection_id='${detection}' WHERE id='${buck}'; INSERT INTO match_candidates VALUES(gen_random_uuid(),'${detection}','${buck}');`)
 console.log('PASS same-owner detection/reference/match writes accepted')
 await db.exec(`RESET ROLE; UPDATE detections SET crop_file_path='crops/00000000-0000-4000-8000-000000000099.jpg' WHERE id='${detection}'; SET ROLE authenticated; UPDATE detections SET deer_id='${buck}' WHERE id='${detection}';`)
 console.log('PASS legacy separately-generated crop UUID survives normal Buck assignment')
 await denied(`INSERT INTO detections(id,image_id,crop_file_path) VALUES(gen_random_uuid(),'${photo}','crops/${foreignDetection}.jpg')`,'client cannot create forged crop-bearing detection')
 const catalog=await db.query(`SELECT * FROM get_deer_catalog('${owner}')`)
 assert.equal(Number(catalog.rows[0].sighting_count),1)
 await db.query(`SELECT * FROM filter_detections_with_images('${owner}')`)
 console.log('PASS hardened catalog/filter functions execute under authenticated role')
 await db.exec(`RESET ROLE; INSERT INTO showcases VALUES(gen_random_uuid(),'${owner}','Lease','test-token',true); INSERT INTO showcase_bucks SELECT id,'${buck}',0 FROM showcases;`)
 const showcase=await db.query(`SELECT * FROM get_public_showcase('test-token')`)
 assert.equal(showcase.rows[0].image_path,`medium/${photo}.webp`)
 console.log('PASS Showcase derives authorized hero path')

 if (process.env.TINESIGHT_TEST_UPLOAD) {
  await db.exec(`
   CREATE SCHEMA storage; CREATE TABLE storage.objects(bucket_id text,name text,metadata jsonb);
   ALTER TABLE images ADD COLUMN created_at timestamptz DEFAULT now(), ADD COLUMN original_filename text, ADD COLUMN file_size_bytes bigint DEFAULT 123,
    ADD COLUMN is_cancelled bool NOT NULL DEFAULT false, ADD COLUMN detection_status text NOT NULL DEFAULT 'pending',
    ADD COLUMN variant_status text NOT NULL DEFAULT 'pending', ADD COLUMN variant_error text, ADD COLUMN error_message text;
   ALTER TABLE processing_batches ADD COLUMN status text NOT NULL DEFAULT 'uploading', ADD COLUMN cancelled_at timestamptz, ADD COLUMN completed_at timestamptz,
    ADD COLUMN uploaded_images int NOT NULL DEFAULT 0, ADD COLUMN total_images int NOT NULL DEFAULT 1, ADD COLUMN processed_images int NOT NULL DEFAULT 0, ADD COLUMN successful_images int NOT NULL DEFAULT 0, ADD COLUMN failed_images int NOT NULL DEFAULT 0;
   ALTER TABLE upload_sessions ADD COLUMN status text NOT NULL DEFAULT 'uploading', ADD COLUMN cancelled_at timestamptz, ADD COLUMN completed_at timestamptz,
    ADD COLUMN uploaded_count int NOT NULL DEFAULT 0, ADD COLUMN total_batches int NOT NULL DEFAULT 1, ADD COLUMN total_images int NOT NULL DEFAULT 1, ADD COLUMN processed_count int NOT NULL DEFAULT 0, ADD COLUMN failed_count int NOT NULL DEFAULT 0;
  `)
  await db.exec(await readFile(new URL('../supabase/migrations/058_upload_readiness_and_lifecycle.sql',import.meta.url),'utf8'))
  await db.exec(`CREATE TRIGGER batch_auto_complete BEFORE UPDATE ON processing_batches FOR EACH ROW EXECUTE FUNCTION check_batch_completion();
   CREATE TRIGGER trigger_update_session_on_batch_change AFTER INSERT OR UPDATE ON processing_batches FOR EACH ROW EXECUTE FUNCTION update_session_on_batch_change();
   SET ROLE authenticated;`)
  await assert.rejects(db.exec(`SELECT finalize_upload_batch('${batch}',ARRAY['${photo}']::uuid[])`),/incomplete/)
  console.log('PASS upload reservation without Storage object rejected')
  await assert.rejects(db.exec(`SELECT claim_photo_work('${photo}','analysis',now())`),e=>e.code==='42501')
  console.log('PASS authenticated callers cannot claim worker jobs')
  await db.exec(`RESET ROLE; INSERT INTO storage.objects VALUES('photos','${owner}/original.jpg','{"size":122}'); SET ROLE authenticated;`)
  await assert.rejects(db.exec(`SELECT finalize_upload_batch('${batch}',ARRAY['${photo}']::uuid[])`),/incomplete/)
  console.log('PASS incomplete original size rejected')
  await db.exec(`RESET ROLE; UPDATE storage.objects SET metadata='{"size":123}'; SET ROLE authenticated;`)
  // A foreign photo id in either list must be rejected before any write. The bare
  // `unnest(...) id` alias made the guard a tautology, so this marked another
  // tenant's photo failed under SECURITY DEFINER.
  await assert.rejects(db.exec(`SELECT finalize_upload_batch('${batch}',ARRAY['${photo}']::uuid[],ARRAY['${foreignPhoto}']::uuid[])`),/Invalid photo IDs/)
  await assert.rejects(db.exec(`SELECT finalize_upload_batch('${batch}',ARRAY['${photo}','${foreignPhoto}']::uuid[])`),/Invalid photo IDs/)
  await db.exec('RESET ROLE;')
  const foreign=(await db.query(`SELECT detection_status,upload_completed_at FROM images WHERE id='${foreignPhoto}'`)).rows[0]
  assert.equal(foreign.detection_status,'pending');assert.equal(foreign.upload_completed_at,null)
  await db.exec('SET ROLE authenticated;')
  console.log('PASS finalize rejects photo ids outside the caller\'s batch and writes nothing')
  const ready=await db.query(`SELECT finalize_upload_batch('${batch}',ARRAY['${photo}']::uuid[]) AS result`)
  assert.deepEqual(ready.rows[0].result.image_ids,[photo])
  await db.exec(`SELECT finish_upload_session('${session}'); RESET ROLE; SET ROLE service_role;`)
  const claim=await db.query(`SELECT * FROM claim_photo_work('${photo}','analysis',now())`)
  assert.equal(claim.rows.length,1)
  assert.equal((await db.query(`SELECT * FROM claim_photo_work('${photo}','analysis',now())`)).rows.length,0)
  console.log('PASS ready upload queues once; duplicate live work claim rejected')
  await db.exec(`RESET ROLE; UPDATE images SET detection_status='completed' WHERE id='${photo}'; UPDATE images SET detection_status='completed' WHERE id='${photo}';`)
  const counters=(await db.query(`SELECT * FROM processing_batches WHERE id='${batch}'`)).rows[0]
  assert.equal(counters.processed_images,1);assert.equal(counters.successful_images,1);assert.equal(counters.status,'completed')
  assert.equal((await db.query(`SELECT status FROM upload_sessions WHERE id='${session}'`)).rows[0].status,'completed')
  console.log('PASS repeated terminal writes count once and finish session')
  await db.exec(`UPDATE images SET detection_status='failed' WHERE id='${photo}'; UPDATE images SET detection_status='processing' WHERE id='${photo}';`)
  const retry=(await db.query(`SELECT * FROM processing_batches WHERE id='${batch}'`)).rows[0]
  assert.equal(retry.processed_images,0);assert.equal(retry.failed_images,0);assert.equal(retry.status,'processing')
  console.log('PASS retry withdraws prior terminal contribution')
  await db.exec(`GRANT SELECT ON images,processing_batches TO service_role; SET ROLE authenticated;`)
  await denied(`UPDATE images SET analysis_attempts=0 WHERE id='${photo}'`,'caller cannot reset persisted worker budget')
  await assert.rejects(db.exec(`SELECT expire_photo_work_budgets()`),e=>e.code==='42501')
  await db.exec(`RESET ROLE; SET ROLE service_role;`)
  for (let attempt=1; attempt<=3; attempt++) {
    const result=await db.query(`SELECT * FROM claim_photo_work('${photo}','variants',now()-interval '11 minutes')`)
    assert.equal(result.rows.length,1)
    assert.equal(result.rows[0].variant_attempts,attempt)
  }
  assert.equal((await db.query(`SELECT * FROM claim_photo_work('${photo}','variants',now())`)).rows.length,0)
  await db.exec(`SELECT expire_photo_work_budgets(); SELECT expire_photo_work_budgets();`)
  let exhausted=(await db.query(`SELECT * FROM images WHERE id='${photo}'`)).rows[0]
  assert.equal(exhausted.variant_status,'failed');assert.match(exhausted.variant_error,/3 interrupted attempts/)
  assert.equal(exhausted.detection_status,'processing')
  await db.exec(`RESET ROLE; UPDATE images SET analysis_claimed_at=now()-interval '21 minutes' WHERE id='${photo}'; SET ROLE service_role;`)
  for(let attempt=2;attempt<=3;attempt++) {
    const result=await db.query(`SELECT * FROM claim_photo_work('${photo}','analysis',now()-interval '21 minutes')`)
    assert.equal(result.rows[0].analysis_attempts,attempt)
  }
  await db.exec(`SELECT expire_photo_work_budgets(); SELECT expire_photo_work_budgets();`)
  exhausted=(await db.query(`SELECT * FROM images WHERE id='${photo}'`)).rows[0]
  assert.equal(exhausted.detection_status,'failed');assert.match(exhausted.error_message,/3 interrupted attempts/)
  assert.equal((await db.query(`SELECT processed_images FROM processing_batches WHERE id='${batch}'`)).rows[0].processed_images,1)
  assert.equal((await db.query(`SELECT * FROM claim_photo_work('${photo}','analysis',now())`)).rows.length,0)
  await db.exec(`RESET ROLE; SET ROLE authenticated;`)
  assert.equal((await db.query(`SELECT * FROM request_photo_retry('${foreignPhoto}')`)).rows.length,0)
  const requested=(await db.query(`SELECT * FROM request_photo_retry('${photo}')`)).rows[0]
  assert.equal(requested.analysis_attempts,0);assert.equal(requested.variant_attempts,0)
  assert.equal(requested.detection_status,'pending');assert.equal(requested.variant_status,'pending')
  assert.equal((await db.query(`SELECT * FROM request_photo_retry('${photo}')`)).rows.length,0)
  await db.exec(`RESET ROLE; UPDATE images SET detection_status='completed',variant_status='failed',variant_attempts=3 WHERE id='${photo}'; SET ROLE authenticated;`)
  const previewOnly=(await db.query(`SELECT * FROM request_photo_retry('${photo}')`)).rows[0]
  assert.equal(previewOnly.detection_status,'completed');assert.equal(previewOnly.variant_attempts,0)
  console.log('PASS explicit owner retry resets only failed budgets, rejects foreign/repeated requests, preserves completed analysis')
  await db.exec(`RESET ROLE; UPDATE images SET variant_status='ready',detection_status='completed' WHERE id='${photo}'; SET ROLE service_role; SELECT expire_photo_work_budgets();`)
  exhausted=(await db.query(`SELECT * FROM images WHERE id='${photo}'`)).rows[0]
  assert.equal(exhausted.variant_status,'ready');assert.equal(exhausted.detection_status,'completed')
  await db.exec(`RESET ROLE;`)
  console.log('PASS stale work reclaims exactly three lifetime attempts, settles once, and preserves completed outputs')

  await db.exec(`UPDATE processing_batches SET status='cancelled',cancelled_at=now() WHERE id='${batch}'; UPDATE upload_sessions SET status='cancelled',cancelled_at=now() WHERE id='${session}'; UPDATE processing_batches SET status='processing' WHERE id='${batch}'; UPDATE upload_sessions SET status='processing' WHERE id='${session}';`)
  assert.equal((await db.query(`SELECT status FROM upload_sessions WHERE id='${session}'`)).rows[0].status,'cancelled')
  assert.equal((await db.query(`SELECT status FROM processing_batches WHERE id='${batch}'`)).rows[0].status,'cancelled')
  await db.exec('SET ROLE authenticated;')
  await assert.rejects(db.exec(`SELECT finalize_upload_batch('${batch}',ARRAY['${photo}']::uuid[])`),/cancelled/i)
  assert.equal((await db.query(`SELECT * FROM request_photo_retry('${photo}')`)).rows.length,0)
  console.log('PASS cancellation remains terminal and rejects late finalize')
  await db.exec(`RESET ROLE;
   CREATE TABLE profiles(id uuid PRIMARY KEY,trophy_threshold int NOT NULL DEFAULT 130);
   INSERT INTO profiles VALUES('${owner}',130),('${other}',130);
   ALTER TABLE profiles ENABLE ROW LEVEL SECURITY; CREATE POLICY profiles_owner ON profiles FOR ALL TO authenticated USING(id=auth.uid()); GRANT ALL ON profiles TO authenticated;
   ALTER TABLE images ADD COLUMN has_deer bool DEFAULT false, ADD COLUMN has_hogs bool DEFAULT false, ADD COLUMN has_cows bool DEFAULT false, ADD COLUMN has_goats bool DEFAULT false, ADD COLUMN has_people bool DEFAULT false, ADD COLUMN has_vehicles bool DEFAULT false, ADD COLUMN is_archived bool NOT NULL DEFAULT false;
   ALTER TABLE detections ADD COLUMN class text, ADD COLUMN score_estimate int;
  `)
  await db.exec(await readFile(new URL('../supabase/migrations/059_photo_triage_and_review.sql',import.meta.url),'utf8'))
  const ownSecond='00000000-0000-4000-8000-000000000013'
  await db.exec(`INSERT INTO images(id,user_id,file_path,upload_completed_at,detection_status) VALUES('${ownSecond}','${owner}','${owner}/second.jpg',now(),'completed');
   UPDATE detections SET class='deer',sex='buck',score_gross=150 WHERE id='${detection}';
   UPDATE images SET detection_status='completed',has_deer=true WHERE id='${photo}';`)
  const tier=async id=>(await db.query(`SELECT triage_tier FROM images WHERE id='${id}'`)).rows[0].triage_tier
  assert.equal(await tier(photo),'trophy')
  await db.exec(`UPDATE detections SET score_gross=100,score_estimate=180 WHERE id='${detection}'`)
  assert.equal(await tier(photo),'buck')
  console.log('PASS authoritative gross controls tier; high estimate cannot promote trophy')
  await db.exec(`UPDATE detections SET score_gross=180,deleted_at=now() WHERE id='${detection}'`)
  assert.equal(await tier(photo),'other')
  await db.exec(`UPDATE detections SET deleted_at=NULL,image_id='${ownSecond}' WHERE id='${detection}'`)
  assert.equal(await tier(photo),'other');assert.equal(await tier(ownSecond),'trophy')
  console.log('PASS soft-delete and reparent refresh both photo tiers')
  await db.exec(`UPDATE profiles SET trophy_threshold=190 WHERE id='${owner}'`)
  assert.equal(await tier(ownSecond),'buck')
  await db.exec(`UPDATE profiles SET trophy_threshold=130 WHERE id='${owner}'; UPDATE images SET has_people=true WHERE id='${ownSecond}'; SET ROLE authenticated;`)
  const counts=(await db.query(`SELECT * FROM get_photo_triage_counts(ARRAY['${photo}','${ownSecond}','${foreignPhoto}']::uuid[])`)).rows
  const count=name=>Number(counts.find(row=>row.tier===name)?.photo_count??0)
  assert.equal(count('trophy'),1);assert.equal(count('security'),1);assert.equal(count('priority'),1);assert.equal(count('all'),2)
  await db.exec(`UPDATE images SET review_status='keep' WHERE id=ANY(ARRAY['${ownSecond}','${foreignPhoto}']::uuid[]); RESET ROLE;`)
  assert.equal((await db.query(`SELECT review_status FROM images WHERE id='${foreignPhoto}'`)).rows[0].review_status,'unreviewed')
  console.log('PASS threshold changes reclassify; trophy/security overlap; counts and bulk review remain tenant-scoped')
  await db.exec(`DELETE FROM detections WHERE id='${detection}'; INSERT INTO detections(id,image_id,class) VALUES(gen_random_uuid(),'${photo}','hog'); UPDATE images SET has_deer=false,has_hogs=true WHERE id='${photo}';`)
  assert.equal(await tier(ownSecond),'other');assert.equal(await tier(photo),'other')
  console.log('PASS hard-delete refreshes tier; nondeer detections never become does')
  await db.exec(await readFile(new URL('../supabase/migrations/060_photo_content_hash.sql',import.meta.url),'utf8'))
  const hashA='a'.repeat(64),hashB='b'.repeat(64),hashC='c'.repeat(64)
  await db.exec(`UPDATE images SET content_sha256='${hashA}' WHERE id='${photo}'; UPDATE images SET content_sha256='${hashB}',upload_completed_at=NULL WHERE id='${ownSecond}'; UPDATE images SET content_sha256='${hashC}',upload_completed_at=now() WHERE id='${foreignPhoto}'; SET ROLE authenticated;`)
  const hashes=await db.query(`SELECT get_uploaded_content_hashes(ARRAY['${hashA}','${hashB}','${hashC}']) AS hashes`)
  assert.deepEqual(hashes.rows[0].hashes,[hashA])
  await db.exec(`UPDATE images SET is_cancelled=true WHERE id='${photo}';`)
  assert.deepEqual((await db.query(`SELECT get_uploaded_content_hashes(ARRAY['${hashA}']) AS hashes`)).rows[0].hashes,[])
  console.log('PASS content hash lookup excludes reservations, foreign originals, legacy nulls, and cancelled photos')
  await db.exec('RESET ROLE; ALTER TABLE detections ADD COLUMN IF NOT EXISTS size_class text;')
  await db.exec(await readFile(new URL('../supabase/migrations/061_numeric_trophy_readers.sql',import.meta.url),'utf8'))
  await db.exec(`INSERT INTO detections(id,image_id,class,sex,size_class,score_gross,is_trophy) VALUES('${detection}','${ownSecond}','deer','buck','trophy',100,true)`)
  const trophyFlag=async()=>(await db.query(`SELECT is_trophy FROM detections WHERE id='${detection}'`)).rows[0].is_trophy
  assert.equal(await trophyFlag(),false)
  await db.exec(`UPDATE detections SET size_class='standard',score_gross=180,is_trophy=false WHERE id='${detection}'`)
  assert.equal(await trophyFlag(),true)
  await db.exec(`SET ROLE authenticated`)
  assert.equal(Number((await db.query(`SELECT trophy_count FROM get_photo_stats('${owner}',NULL::uuid,NULL::uuid)`)).rows[0].trophy_count),1)
  await assert.rejects(db.query(`SELECT * FROM get_photo_stats('${other}',NULL::uuid,NULL::uuid)`),/access denied/)
  await db.exec(`UPDATE profiles SET trophy_threshold=190 WHERE id='${owner}'`)
  assert.equal(await trophyFlag(),false)
  await db.exec(`UPDATE profiles SET trophy_threshold=130 WHERE id='${owner}'`)
  assert.equal(await trophyFlag(),true)
  console.log('PASS numeric trophy flag overrides impression and forged flag, threshold refreshes, stats remain owner-scoped')
  // Tiers read the flag; the two never disagree, including across threshold changes,
  // and 059's separate threshold sweep is gone (one predicate, one cascade).
  assert.equal(await tier(ownSecond),'trophy')
  await db.exec(`UPDATE profiles SET trophy_threshold=190 WHERE id='${owner}'`)
  assert.equal(await trophyFlag(),false);assert.notEqual(await tier(ownSecond),'trophy')
  await db.exec(`UPDATE profiles SET trophy_threshold=130 WHERE id='${owner}'`)
  assert.equal(await trophyFlag(),true);assert.equal(await tier(ownSecond),'trophy')
  assert.equal((await db.query(`SELECT count(*)::int AS n FROM pg_trigger WHERE tgname='profile_photo_triage'`)).rows[0].n,0)
  assert.deepEqual((await db.query(`SELECT * FROM get_photo_stats('${owner}'::uuid,NULL::uuid)`)).rows,(await db.query(`SELECT * FROM get_photo_stats('${owner}'::uuid,NULL::uuid,NULL::uuid)`)).rows,'a two-argument call resolves to the single reader')
  console.log('PASS tiers read the authoritative flag, threshold changes move flag and tier together, and a two-argument stats call resolves to the single reader')
  // A pending-only cancellation keeps completed photos even when their parent is cancelled.
  const cancelledStatsSession='00000000-0000-4000-8000-000000000071'
  const cancelledStatsBatch='00000000-0000-4000-8000-000000000072'
  const keptStatsPhoto='00000000-0000-4000-8000-000000000073'
  const archivedStatsPhoto='00000000-0000-4000-8000-000000000074'
  const cancelledPendingPhoto='00000000-0000-4000-8000-000000000075'
  const cancelledCompletedPhoto='00000000-0000-4000-8000-000000000076'
  await db.exec(`RESET ROLE;
    INSERT INTO upload_sessions(id,user_id,status,cancelled_at) VALUES('${cancelledStatsSession}','${owner}','uploading',NULL);
    INSERT INTO processing_batches(id,user_id,upload_session_id,status,cancelled_at) VALUES('${cancelledStatsBatch}','${owner}','${cancelledStatsSession}','uploading',NULL);
    INSERT INTO images(id,user_id,batch_id,file_path,upload_completed_at,detection_status,is_cancelled,is_archived,has_deer) VALUES
      ('${keptStatsPhoto}','${owner}','${cancelledStatsBatch}','${owner}/kept.jpg',now(),'completed',false,false,true),
      ('${archivedStatsPhoto}','${owner}','${cancelledStatsBatch}','${owner}/archived.jpg',now(),'completed',false,true,true),
      ('${cancelledPendingPhoto}','${owner}','${cancelledStatsBatch}','${owner}/cancelled-pending.jpg',now(),'pending',true,false,false),
      ('${cancelledCompletedPhoto}','${owner}','${cancelledStatsBatch}','${owner}/cancelled-completed.jpg',now(),'completed',true,false,true);
    INSERT INTO detections(id,image_id,class,sex,size_class,score_gross) VALUES
      (gen_random_uuid(),'${keptStatsPhoto}','deer','buck','standard',180),
      (gen_random_uuid(),'${archivedStatsPhoto}','deer','buck','standard',180),
      (gen_random_uuid(),'${cancelledCompletedPhoto}','deer','buck','standard',180);
    UPDATE processing_batches SET status='cancelled',cancelled_at=now() WHERE id='${cancelledStatsBatch}';
    UPDATE upload_sessions SET status='cancelled',cancelled_at=now() WHERE id='${cancelledStatsSession}';
    SET ROLE authenticated;
  `)
  // One statistics reader (061 drops the duplicate two-argument overload), so
  // both the batch and the session scopes resolve without renaming anything.
  for (const invocation of [
    `get_photo_stats('${owner}'::uuid,'${cancelledStatsBatch}'::uuid)`,
    `get_photo_stats('${owner}'::uuid,NULL::uuid,'${cancelledStatsSession}'::uuid)`,
  ]) {
    const stats=(await db.query(`SELECT * FROM ${invocation}`)).rows[0]
    assert.equal(Number(stats.total_photos),2,'cancelled rows excluded; retained completed and archived rows counted')
    assert.equal(Number(stats.analyzed_photos),2)
    assert.equal(Number(stats.pending_photos),0,'pending-only cancellation cannot leave pending stats stuck')
    assert.equal(Number(stats.buck_count),2,'cancelled detection excluded without excluding completed siblings')
    assert.equal(Number(stats.trophy_count),2)
  }
  assert.equal((await db.query(`SELECT count(*)::int AS n FROM pg_proc WHERE proname='get_photo_stats'`)).rows[0].n,1,'one statistics reader remains')
  console.log('PASS the single stats reader excludes cancelled images/detections, retains completed children of cancelled parents, and keeps archived catalog totals')



 }
} finally {await db.close()}
