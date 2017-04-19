FROM python:3

WORKDIR /usr/src/call-roulette

COPY requirements.txt /usr/src/call-roulette

# Install requirements before copying the rest of the application
# then pip install will only ever be run when building if the application's
# requirements.txt changes!
RUN pip install -r /usr/src/call-roulette/requirements.txt

# Avoid using the root user id for the unlikely event of a container breakout
RUN groupadd -r callroulette && useradd -m -r -g callroulette callroulette
USER callroulette

COPY server.crt /usr/src/call-roulette
COPY server.csr /usr/src/call-roulette
COPY server.key /usr/src/call-roulette

COPY app.py /usr/src/call-roulette
COPY index.html /usr/src/call-roulette
COPY static /usr/src/call-roulette/static

EXPOSE 8080

ENTRYPOINT [ "python", "/usr/src/call-roulette/app.py" ]
