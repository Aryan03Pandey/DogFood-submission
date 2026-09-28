CREATE OR REPLACE FUNCTION enforce_prize_floor() RETURNS trigger AS $$
DECLARE
  evt_status event_status;
BEGIN
  SELECT status INTO evt_status FROM events WHERE id = NEW.event_id;
  IF evt_status IS DISTINCT FROM 'DRAFT' AND NEW.cash_value < OLD.cash_value THEN
    RAISE EXCEPTION 'prize values cannot be decreased once the event has left DRAFT (prize %)', OLD.id
      USING ERRCODE = 'raise_exception';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
DROP TRIGGER IF EXISTS prize_floor_trigger ON prizes;--> statement-breakpoint
CREATE TRIGGER prize_floor_trigger BEFORE UPDATE ON prizes FOR EACH ROW EXECUTE FUNCTION enforce_prize_floor();
