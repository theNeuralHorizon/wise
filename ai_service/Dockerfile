FROM python:3.11-slim

RUN useradd -m -s /bin/bash wise
USER wise
WORKDIR /home/wise

COPY main.py prompt.txt ./

ENV PYTHONUNBUFFERED=1

EXPOSE 5000

HEALTHCHECK --interval=10s --timeout=5s --retries=3 --start-period=5s \
  CMD curl -f http://localhost:5000/health || exit 1

CMD ["python", "main.py"]
