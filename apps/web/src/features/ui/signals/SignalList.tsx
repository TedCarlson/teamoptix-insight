type SignalItem = {
  label: string;
  value: string;
  detail?: string;
};

type SignalListProps = {
  items: SignalItem[];
};

export default function SignalList(props: SignalListProps) {
  return (
    <div className="signal-list">
      {props.items.map((item) => (
        <div className="signal-list__row" key={`${item.label}:${item.value}`}>
          <div>
            <strong>{item.label}</strong>
            {item.detail ? <span>{item.detail}</span> : null}
          </div>
          <em>{item.value}</em>
        </div>
      ))}
    </div>
  );
}
