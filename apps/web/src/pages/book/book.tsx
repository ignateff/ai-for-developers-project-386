import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  meetingTypesCreate,
  meetingTypesList,
  type MeetingType,
} from "../../../../../generated/sdk/client";

import { validateType } from "./validate-type";
import { Availability } from "./availability";
import { ManageType } from "./manage-type";
import { loadAttempt, type Attempt } from "./attempt";
import { Recovery } from "./recovery";

export function BookPage() {
  const queryClient = useQueryClient();
  const [attempt, setAttempt] = useState<Attempt | null>(loadAttempt);
  const [guestName, setGuestName] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  const [selectedType, setSelectedType] = useState<MeetingType | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [duration, setDuration] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const list = useQuery({
    queryKey: ["meeting-types"],
    queryFn: async () => {
      const response = await meetingTypesList();
      if (response.status !== 200) throw new Error("Could not load meeting types");
      return response.data;
    },
  });
  const create = useMutation({
    mutationFn: async (input: { name: string; description: string; durationMinutes: number }) => {
      const response = await meetingTypesCreate(input);
      if (response.status !== 201) throw new Error("Could not create meeting type");
      return response.data;
    },
    onSuccess: async () => {
      setName("");
      setDescription("");
      setDuration("");
      await queryClient.invalidateQueries({ queryKey: ["meeting-types"] });
    },
  });
  function submit(event: FormEvent) {
    event.preventDefault();
    const {
      cleanName,
      cleanDescription,
      minutes: durationMinutes,
      fields: next,
    } = validateType(name, description, duration);
    setErrors(next);
    if (!Object.keys(next).length)
      create.mutate({ name: cleanName, description: cleanDescription, durationMinutes });
  }
  if (attempt)
    return (
      <Recovery
        attempt={attempt}
        onDone={() => {
          setAttempt(null);
          setSelectedType(null);
        }}
      />
    );
  if (selectedType)
    return (
      <Availability
        onUnknown={setAttempt}
        name={guestName}
        email={guestEmail}
        setName={setGuestName}
        setEmail={setGuestEmail}
        type={selectedType}
        onBack={() => {
          setSelectedType(null);
          void list.refetch();
        }}
      />
    );
  return (
    <section className="container booking" aria-label="Типы встреч">
      <header className="page-header">
        <h1 className="page-title">Типы встреч</h1>
        <p className="page-subtitle">Выберите подходящий формат звонка или создайте свой</p>
      </header>
      {list.isPending && <p className="type-empty">Загрузка типов встреч…</p>}
      {list.isError && (
        <div role="alert" className="alert">
          Не удалось загрузить типы встреч.{" "}
          <button type="button" className="btn btn-subtle" onClick={() => void list.refetch()}>
            Повторить
          </button>
        </div>
      )}
      {list.data?.length === 0 && <p className="type-empty">Пока нет типов встреч</p>}
      <div className="type-list">
        {list.data?.map((item) => (
          <article key={item.id} className="card">
            <h2 className="type-card-name">{item.name}</h2>
            <p className="type-card-description">{item.description}</p>
            <p className="type-card-duration">{item.durationMinutes} мин.</p>
            <div className="type-card-actions">
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => setSelectedType(item)}
              >
                Выбрать {item.name}
              </button>
              <ManageType
                type={item}
                refresh={() => {
                  void list.refetch();
                }}
              />
            </div>
          </article>
        ))}
        <section className="card" aria-labelledby="create-type-heading">
          <h2 className="type-create-title" id="create-type-heading">
            Создать тип встречи
          </h2>
          <form onSubmit={submit} noValidate>
            <div className="form-fields">
              <div className="field">
                <label className="field-label" htmlFor="type-name">
                  Название
                </label>
                <input
                  id="type-name"
                  className="field-input"
                  value={name}
                  onChange={(event) => setName(event.currentTarget.value)}
                  aria-invalid={errors.name ? "true" : undefined}
                  required
                />
                {errors.name && <p className="field-error">{errors.name}</p>}
              </div>
              <div className="field">
                <label className="field-label" htmlFor="type-description">
                  Описание
                </label>
                <textarea
                  id="type-description"
                  className="field-input"
                  value={description}
                  onChange={(event) => setDescription(event.currentTarget.value)}
                  aria-invalid={errors.description ? "true" : undefined}
                  required
                />
                {errors.description && <p className="field-error">{errors.description}</p>}
              </div>
              <div className="field">
                <label className="field-label" htmlFor="type-duration">
                  Длительность в минутах
                </label>
                <input
                  id="type-duration"
                  className="field-input"
                  type="number"
                  value={duration}
                  onChange={(event) => setDuration(event.currentTarget.value)}
                  aria-invalid={errors.duration ? "true" : undefined}
                  required
                />
                {errors.duration && <p className="field-error">{errors.duration}</p>}
              </div>
              {create.isError && (
                <p role="alert" className="alert form-alert">
                  Не удалось создать тип встречи. Попробуйте ещё раз.
                </p>
              )}
              <div>
                <button type="submit" className="btn btn-accent" disabled={create.isPending}>
                  Создать тип
                </button>
              </div>
            </div>
          </form>
        </section>
      </div>
    </section>
  );
}
