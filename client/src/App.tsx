import { AddItemForm } from "./components/AddItemForm";
import { AskPanel } from "./components/AskPanel";
import { ItemList } from "./components/ItemList";
import { useItems } from "./hooks/useItems";

export function App() {
  const { items, loading, error, add, remove } = useItems();
  const readyCount = items.filter((i) => i.status === "ready").length;

  return (
    <main className="layout">
      <header>
        <h1>AI Knowledge Inbox</h1>
        <p className="muted">Save notes and pages, then ask questions. Answers come only from what you saved.</p>
      </header>

      <div className="columns">
        <div className="column">
          <AddItemForm onAdd={add} />
          <ItemList items={items} loading={loading} error={error} onRemove={remove} />
        </div>
        <div className="column">
          <AskPanel readyCount={readyCount} />
        </div>
      </div>
    </main>
  );
}
