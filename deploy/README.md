## Deployment strategy for Call Roulette

There are three ways to deploy and run Call Roulette

- Running the Call Roulette python application (included in `app.py` file).
- Using a docker image that contains the Call Roulette python application.
- Deploying the docker image in a Kubernetes cluster

### python application

Python 3.x interpreter is required (support to async.io framework)

```bash
pip install -r requirements.txt
python app.py
```

### Docker image

```bash
docker build -t call-roulette:latest .
docker run -p 8080:8080 call-roulette:latest
```

### k8s cluster

Recommended strategy is using a Kubernetes cluster. If you already own one,
all you need to do is execute the following command (after making sure you've
configured the right context):

```bash
kubectl apply -f deploy/call-roulette-deploy.yaml
```

You can find in the [k8s cheat sheet](k8s-cheat-sheet.md) the basic commands
to manage this application.
