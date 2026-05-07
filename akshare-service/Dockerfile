FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends gcc g++ curl \
    && rm -rf /var/lib/apt/lists/*

# Render may build this Dockerfile with either the repository root
# or the akshare-service folder as Docker context. Copy the context
# first, then normalize required files into /app.
COPY . /tmp/source

RUN if [ -f /tmp/source/akshare-service/requirements.txt ]; then \
      cp /tmp/source/akshare-service/requirements.txt /app/requirements.txt; \
    elif [ -f /tmp/source/requirements.txt ]; then \
      cp /tmp/source/requirements.txt /app/requirements.txt; \
    else \
      echo "requirements.txt not found in build context" && find /tmp/source -maxdepth 3 -type f | sort && exit 1; \
    fi

RUN pip install --no-cache-dir --upgrade pip \
    && pip install --no-cache-dir -r requirements.txt

RUN if [ -f /tmp/source/akshare-service/main.py ]; then \
      cp /tmp/source/akshare-service/main.py /app/main.py; \
    elif [ -f /tmp/source/main.py ]; then \
      cp /tmp/source/main.py /app/main.py; \
    else \
      echo "main.py not found in build context" && find /tmp/source -maxdepth 3 -type f | sort && exit 1; \
    fi

EXPOSE 8000

CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}"]
