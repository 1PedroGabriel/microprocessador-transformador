type EventLogProps = {
  events: string[];
};

function EventLog({ events }: EventLogProps) {
  return (
    <div className="card">
      <div className="section-title">Eventos Recentes</div>
      <div className="event-log">
        {events.length === 0 ? (
          <div>Sem eventos ainda.</div>
        ) : (
          events.map((event, index) => <div key={`${event}-${index}`}>{event}</div>)
        )}
      </div>
    </div>
  );
}

export default EventLog;
