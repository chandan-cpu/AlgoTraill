import json
import os
from contextlib import asynccontextmanager
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Literal

from fastapi import Depends, FastAPI, HTTPException
from pydantic import BaseModel, Field, HttpUrl
from sqlalchemy import Date, DateTime, ForeignKey, Integer, String, Text, URL, create_engine, select
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column

database_url = os.getenv('DATABASE_URL') or URL.create('postgresql+psycopg', username=os.getenv('DB_USER', 'dsa'), password=os.getenv('DB_PASSWORD', ''), host=os.getenv('DB_HOST', 'localhost'), database=os.getenv('DB_NAME', 'dsa_tracker'))
engine = create_engine(database_url, pool_pre_ping=True)
class Base(DeclarativeBase):
    pass

class Problem(Base):
    __tablename__ = 'problems'
    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(160))
    topic_id: Mapped[int] = mapped_column(Integer)
    difficulty: Mapped[str] = mapped_column(String(10))
    url: Mapped[str] = mapped_column(String(2048), default='')
    status: Mapped[str] = mapped_column(String(20), default='Todo')
    notes: Mapped[str] = mapped_column(Text, default='')
    starred: Mapped[bool] = mapped_column(default=False)
    revision_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    solved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

class StudySession(Base):
    __tablename__ = 'study_sessions'
    id: Mapped[int] = mapped_column(primary_key=True)
    minutes: Mapped[int] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

SEED = json.loads(Path(__file__).with_name('seed.json').read_text())
@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(engine)
    with Session(engine) as db:
        for topic in SEED:
            for p in topic['problems']:
                if db.get(Problem, p['id']) is None:
                    db.add(Problem(**p))
        db.commit()
    yield

app = FastAPI(title='AlgoTrail API', version='1.0.0', lifespan=lifespan)
def session():
    with Session(engine) as db:
        yield db

Status = Literal['Todo', 'In progress', 'Solved', 'Revisit']
class ProblemPatch(BaseModel):
    status: Status | None = None
    notes: str | None = Field(default=None, max_length=20000)
    starred: bool | None = None
    revision_date: date | None = None

class ProblemCreate(BaseModel):
    title: str = Field(min_length=1, max_length=160)
    topic_id: int = Field(ge=1, le=16)
    difficulty: Literal['Easy', 'Medium', 'Hard'] = 'Easy'
    url: HttpUrl | None = None

class SessionCreate(BaseModel):
    minutes: int = Field(ge=1, le=480)

def serialize(p: Problem):
    return {c.name: getattr(p, c.name) for c in Problem.__table__.columns}

@app.get('/api/health')
def health(db: Session = Depends(session)):
    db.execute(select(1))
    return {'status': 'ok', 'storage': engine.dialect.name}

@app.get('/api/state')
def state(db: Session = Depends(session)):
    return {'problems': [serialize(p) for p in db.scalars(select(Problem).order_by(Problem.id))], 'sessions': [{'id': s.id, 'minutes': s.minutes, 'created_at': s.created_at} for s in db.scalars(select(StudySession))]}

@app.patch('/api/problems/{problem_id}')
def update_problem(problem_id: int, patch: ProblemPatch, db: Session = Depends(session)):
    p = db.get(Problem, problem_id)
    if p is None:
        raise HTTPException(404, 'Problem not found')
    fields = patch.model_dump(exclude_unset=True)
    if any(fields.get(key) is None for key in ('status', 'notes', 'starred') if key in fields):
        raise HTTPException(422, 'Only revision_date may be null')
    if 'status' in fields:
        if fields['status'] == 'Solved' and p.status != 'Solved':
            p.solved_at = datetime.now(timezone.utc)
        elif fields['status'] != 'Solved':
            p.solved_at = None
    for key, value in fields.items():
        setattr(p, key, value)
    db.commit()
    db.refresh(p)
    return serialize(p)

@app.post('/api/problems', status_code=201)
def add_problem(body: ProblemCreate, db: Session = Depends(session)):
    if not body.title.strip():
        raise HTTPException(422, 'Title cannot be blank')
    # Seed IDs are explicit; custom records use a separate sequence-free range.
    from sqlalchemy import func
    next_id = max(db.scalar(select(func.max(Problem.id))) or 0, 10000) + 1
    # Serialize custom inserts with a PostgreSQL transaction lock.
    if engine.dialect.name == 'postgresql':
        from sqlalchemy import text
        db.execute(text('SELECT pg_advisory_xact_lock(921704)'))
        next_id = max(db.scalar(select(func.max(Problem.id))) or 0, 10000) + 1
    p = Problem(id=next_id, title=body.title.strip(), topic_id=body.topic_id, difficulty=body.difficulty, url=str(body.url) if body.url else '')
    db.add(p)
    db.commit()
    db.refresh(p)
    return serialize(p)

@app.post('/api/sessions', status_code=201)
def add_session(body: SessionCreate, db: Session = Depends(session)):
    s = StudySession(minutes=body.minutes)
    db.add(s)
    db.commit()
    db.refresh(s)
    return {'id': s.id, 'minutes': s.minutes, 'created_at': s.created_at}
