import importlib
import pytest
from fastapi.testclient import TestClient

@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv('DATABASE_URL', f'sqlite:///{tmp_path / "test.db"}')
    import app.main
    module = importlib.reload(app.main)
    with TestClient(module.app) as test_client:
        yield test_client
    module.engine.dispose()

def test_progress_notes_revision_and_persistence(client):
    first = client.get('/api/state').json()['problems'][0]
    assert first['status'] == 'Todo'
    result = client.patch(f'/api/problems/{first["id"]}', json={'status':'Solved', 'notes':'O(n) time', 'revision_date':'2026-12-01', 'starred':True})
    assert result.status_code == 200
    assert result.json()['solved_at']
    persisted = client.get('/api/state').json()['problems'][0]
    assert persisted['notes'] == 'O(n) time'
    assert persisted['revision_date'] == '2026-12-01'
    assert persisted['starred']
    result = client.patch(f'/api/problems/{first["id"]}', json={'status':'Revisit','revision_date':None})
    assert result.json()['solved_at'] is None
    assert result.json()['revision_date'] is None

def test_validation_and_missing_records(client):
    assert client.patch('/api/problems/101', json={'status':'invalid'}).status_code == 422
    assert client.patch('/api/problems/101', json={'status':None}).status_code == 422
    assert client.patch('/api/problems/99999', json={'status':'Solved'}).status_code == 404
    assert client.post('/api/problems', json={'title':'  ', 'topic_id':1}).status_code == 422
    assert client.post('/api/problems', json={'title':'Bad link', 'topic_id':1, 'url':'javascript:alert(1)'}).status_code == 422
    assert client.post('/api/sessions', json={'minutes':-1}).status_code == 422

def test_custom_problems_and_sessions(client):
    body = {'title':'Custom practice', 'topic_id':3, 'difficulty':'Medium', 'url':'https://example.com/problem'}
    first = client.post('/api/problems', json=body)
    second = client.post('/api/problems', json=body)
    assert first.status_code == 201
    assert first.json()['id'] != second.json()['id']
    assert first.json()['status'] == 'Todo'
    assert client.post('/api/sessions', json={'minutes':25}).status_code == 201
    assert client.get('/api/state').json()['sessions'][0]['minutes'] == 25

def test_seed_is_idempotent(client):
    count = len(client.get('/api/state').json()['problems'])
    with TestClient(client.app) as second:
        assert len(second.get('/api/state').json()['problems']) == count
