FROM python:3

ADD app.py /
ADD static /static
ADD index.html /
ADD requirements.txt /

ADD server.crt /
ADD server.csr /
ADD server.key /

RUN pip install -r requirements.txt

EXPOSE 8080

CMD [ "python", "./app.py" ]
