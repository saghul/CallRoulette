FROM python:3

WORKDIR /usr/src/call-roulette

COPY app.py /usr/src/call-roulette
COPY static /usr/src/call-roulette/static
COPY index.html /usr/src/call-roulette
COPY requirements.txt /usr/src/call-roulette
COPY server.crt /usr/src/call-roulette
COPY server.csr /usr/src/call-roulette
COPY server.key /usr/src/call-roulette

RUN pip install -r /usr/src/call-roulette/requirements.txt

EXPOSE 8080

ENTRYPOINT [ "python", "/usr/src/call-roulette/app.py" ]
