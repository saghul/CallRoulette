### Minikube information

Check local environment minikube version:

```bash
> minikube version
minikube version: v0.17.1
```

Start minikube:

```bash
> minikube start
Starting local Kubernetes cluster...
Starting VM...
SSH-ing files into VM...
Setting up certs...
Starting cluster components...
Connecting to cluster...
Setting up kubeconfig...
Kubectl is now configured to use the cluster.
```

### Cluster info

See both client and server k8s version:

```bash
> kubectl version --short
Client Version: v1.5.3
Server Version: v1.5.3
```

Get information about endpoints for k8s master, DNS and dashboards
```bash
> kubectl cluster-info
Kubernetes master is running at https://192.168.99.100:8443
KubeDNS is running at https://192.168.99.100:8443/api/v1/proxy/namespaces/kube-system/services/kube-dns
kubernetes-dashboard is running at https://192.168.99.100:8443/api/v1/proxy/namespaces/kube-system/services/kubernetes-dashboard
```

View list of nodes that are part of the k8s cluster:

```bash
> kubectl get nodes
NAME       STATUS    AGE
minikube   Ready     76d
```

### Contexts

Get list of configured contexts:

```bash
> kubectl config get-contexts
CURRENT   NAME                CLUSTER           AUTHINFO                NAMESPACE
*         minikube            minikube          minikube
```

Update the current context with a namespace:

```bash
> kubectl config set-context $(kubectl config view | awk '/current-context/ {print $2}') --namespace=call-roulette
Context "minikube" set.

> kubectl config get-contexts
CURRENT   NAME                CLUSTER           AUTHINFO                NAMESPACE
*         minikube            minikube          minikube                call-roulette

```

### Deployment

Deploy an app:

```bash
> kubectl run <deployment-name> --image=<docker-image>:<image-version> --port=<port-to-be-used-by-the-app>

> kubectl run call-roulette --image=docker.io/juandebravo/call-roulette:0.2 --port=8080
deployment "call-roulette" created
```

Check deployments:

```bash
> kubectl get deployments --namespace=default
NAME            DESIRED   CURRENT   UP-TO-DATE   AVAILABLE   AGE
call-roulette   1         1         1            1           2m
```

Describe deployments:

```bash
> kubectl describe deployment <deployment-name>

> kubectl describe deployment call-roulette --namespace=call-roulette
Name:           call-roulette
Namespace:      call-roulette
CreationTimestamp:  Tue, 14 Mar 2017 19:12:30 +0100
Labels:         app=call-roulette
Selector:       app=call-roulette
Replicas:       1 updated | 1 total | 1 available | 0 unavailable
StrategyType:       RollingUpdate
MinReadySeconds:    0
RollingUpdateStrategy:  1 max unavailable, 1 max surge
Conditions:
  Type      Status  Reason
  ----      ------  ------
  Available     True    MinimumReplicasAvailable
OldReplicaSets: <none>
NewReplicaSet:  call-roulette-2078099983 (1/1 replicas created)
No events.
```

Upon creating a deployment using *run* command, the impacted elements
(like services and pods) are automatically tagged/labled, using
as key `run` and as label the `<deployment-name>`.:

```bash
> kubectl get pods -l run=<deployment-name>

> kubectl get pods,services,deployments -l run=call-roulette
```

Note: if you create elements using the *apply* command, those elements are
tagged as well but using the key `app`.

Scale a deployment (load balance the incoming requests automatically):
```bash
> kubectl scale deployments/<deployment-name> --replicas=N

> kubectl scale deployments/call-roulette --replicas=4
deployment "call-roulette" scaled
```

Rolling update:

```bash
> kubectl set image deployments/<deployment-name> <image-name>=<container-image:<version>

> kubectl set image deployments/call-roulette call-roulette=juandebravo/call-roulette:0.3
deployment "call-roulette" image updated
```

Rollback:

```bash
> kubectl rollout undo deployments/<deployment-name>

> kubectl rollout undo deployments/call-roulette
deployment "call-roulette" rolled back
```

### Proxy

Proxy element creates a route between the host machine and the Kubernetes cluster:

```bash
> kubectl proxy
Starting to serve on 127.0.0.1:8001
```

Once you have the proxy created, you can access a pod via the proxy:

```bash
> `Get <pod-name>`
> kubectl proxy
> http://localhost:8001/api/v1/proxy/namespaces/<namespace>/pods/<pod-name>

> http://localhost:8001/api/v1/proxy/namespaces/call-roulette/pods/call-roulette-2078099983-bjhk9
```

Is it useful a proxy? In general no, as you can expose your pods in a more elegant way by
means of a Service. I've found it useful though for being able to use `getUserMedia`
using HTTP, as *proxy* is accessed via *localhost*, and a Service is exposed in the IP
where the cluster is running (*192.168.99.100* by default).

But (there's always a *but* :-)), if you feel strong about not using a proxy, you can
still use getUserMedia via HTTP in an IP different than localhost:

```bash
# Get the port where the call-roulette service is running
> kubectl get services/call-roulette -o go-template='{{(index .spec.ports 0).nodePort}}'
32659

# Start a new Chrome instance, flagging to use the k8s cluster IP and the service port as secure
> /Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --unsafely-treat-insecure-origin-as-secure="http://192.168.99.100:32659" --user-data-dir=/tmp/chrome-temp

# Now you can access http://192.168.99.100:32659 and enjoy getUserMedia using HTTP
```

### Port forward

```bash
> kubectl port-forward <pod-name> localPort:podPort

> kubectl port-forward call-roulette-2078099983-vmd9c 9090:8080
Forwarding from 127.0.0.1:9090 -> 8080
Forwarding from [::1]:9090 -> 8080
```

### Pods

Get pods list:

```bash
> kubectl get pods

# Get only the pod name...
> kubectl get pods -o go-template --template '{{range .items}}{{.metadata.name}}{{"\n"}}{{end}}'

# or...
> kubectl get pods -o name | sed 's/^pod\///'
call-roulette-2078099983-1kgd6
call-roulette-2078099983-9qg7d
call-roulette-2078099983-bjhk9
call-roulette-2078099983-z02k6
```

View which containers are inside a Pod and what images are used to build those containers

```bash
> kubectl describe pods <pod-name>

> kubectl describe pods | awk '/Image:/ {print $2}'
juandebravo/call-roulette:0.2
juandebravo/call-roulette:0.2
juandebravo/call-roulette:0.2
juandebravo/call-roulette:0.2
```

View logs (container name is required only if the pod has more than one container)

```bash
> kubectl logs <pod-name> <container-name>

> kubectl logs call-roulette-2078099983-bjhk9
DEBUG:asyncio:Using selector: EpollSelector
INFO:CallRoulette:Server started at 0.0.0.0:8080
INFO:aiohttp.access:172.17.0.1 - - [15/Mar/2017:11:21:20 +0000] "GET / HTTP/1.1" 200 910 "-" "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_12_3) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/57.0.2987.98 Safari/537.36"
DEBUG:CallRoulette:Loaded file css/style.css (text/css)
...
```

Exec a command in a container (container name is required only
if the pod has more than one container):

```bash
> kubectl exec <pod-name> <container-name> <command>

# include `-ti` if you need the session to be a TTY
> kubectl exec -ti <pod-name> <container-name> bash

Label a pod:

```bash
> kubectl label pod <pod-name> `key`=`value`

> kubectl label pod call-roulette-1494011838-ttcvq app=v2
```

Filter pods by label:

```nash
> kubectl get pods -l `key`=`value`

> kubectl get pods -l app=v2
```

### Service

Get services

```bash
> kubectl get services
NAME            CLUSTER-IP   EXTERNAL-IP   PORT(S)        AGE
call-roulette   10.0.0.221   <nodes>       80:32659/TCP   47m
```

Create a new service and expose it to external traffic
Note: minikube supports NodePort, it does not support LoadBalancer

```bash
> kubectl expose deployment <deployment-name> --type="NodePort" --port <port-to-be-used>

kubectl expose deployment call-roulette --type="NodePort" --port <port-to-be-used>
```

Get service info

```bash
> kubectl describe services/<service-name>
```

Get service NodePort

```bash
> kubectl get services/<service-name> -o go-template='{{(index .spec.ports 0).nodePort}}'

> kubectl get services/call-roulette -o go-template='{{(index .spec.ports 0).nodePort}}'
32659
```

Now you can:

- get the IP where minikube runs
    > minikube ip
    192.168.99.100

- get the port where the service is exposed
    > kubectl get services/call-roulette -o go-template='{{(index .spec.ports 0).nodePort}}'
    32659

- Run a curl
    > curl http://<minikube-ip>:<service-port>
    > curl http://192.168.99.100:32659

Delete service

```bash
> kubectl delete service <service-name>
```

### Secrets

Create a secret:

```bash
kubectl create secret generic my-secret --from-file=path/to/bar
```

### Configmap

Create a configmap

```bash
kubectl create configmap my-configmap --from-file=path/to/bazz
```
